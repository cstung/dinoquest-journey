from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_active_membership, get_current_user, require_parent
from backend.models import (
    ActivityLog,
    FamilyMember,
    TestAssignment,
    TestAttempt,
    TestAttemptAnswer,
    TestQuestion,
    TestReopenRequest,
    UserFamilyLevel,
    User,
    VideoTest,
)
from backend.realtime import emit_family_event
from backend.schemas.video_test import (
    TestAvailabilityUpdateIn,
    TestGenerateQuestionsOut,
    TestGenerateQuestionsRequest,
    TestAttemptReviewOut,
    TestAttemptReviewQuestionOut,
    TestAssignedMemberOut,
    TestAttemptStartOut,
    TestListItemOut,
    TestPageOut,
    TestPreviewOut,
    TestPreviewRequest,
    TestQuestionDraft,
    TestRegenerateQuestionRequest,
    TestSubtitlePreviewOut,
    TestSubtitlePreviewRequest,
    TestPublishRequest,
    TestQuestionForAttemptOut,
    TestReopenRequestIn,
    TestReopenRequestOut,
    TestReopenResolveIn,
    TestReopenResolveOut,
    TestSubmitOut,
    TestSubmitRequest,
)
from backend.services.quiz_generator import (
    generate_quiz_questions,
    generate_single_quiz_question,
)
from backend.services.subtitle_service import (
    SubtitleUnavailableError,
    build_subtitle_payload,
)
from backend.services.xp_engine import award_xp

router = APIRouter()


def _subtitle_http_error(exc: SubtitleUnavailableError) -> HTTPException:
    status_code = 422
    if getattr(exc, "code", "") in {"network_policy_blocked", "network_timeout", "dependency_missing"}:
        status_code = 503
    return HTTPException(
        status_code=status_code,
        detail={
            "msg": str(exc) or "No subtitles are available for this video.",
            "code": getattr(exc, "code", "subtitle_unavailable"),
        },
    )


def _parse_cursor(cursor: str | None) -> datetime | None:
    if not cursor:
        return None
    dt = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _option_label(index: int) -> str:
    return ("A", "B", "C", "D")[index]


def _option_index(label: str) -> int:
    try:
        return {"A": 0, "B": 1, "C": 2, "D": 3}[label]
    except KeyError as exc:
        raise ValueError("Invalid option label") from exc


def _availability_status(value: str) -> str:
    lowered = (value or "").strip().lower()
    if lowered in {"inactive", "disabled"}:
        return "inactive"
    if lowered in {"deleted", "archived"}:
        return "deleted"
    return "active"


async def _assignment_status_for_test(
    test_id: int,
    family_id: int,
    *,
    current_user_id: int | None,
    role: str,
    db: AsyncSession,
) -> tuple[str, list[TestAssignedMemberOut], int]:
    rows = await db.execute(
        select(TestAssignment, User, FamilyMember.avatar_color)
        .join(User, User.id == TestAssignment.user_id)
        .outerjoin(
            FamilyMember,
            and_(
                FamilyMember.family_id == family_id,
                FamilyMember.user_id == TestAssignment.user_id,
            ),
        )
        .where(TestAssignment.test_id == test_id, TestAssignment.family_id == family_id)
        .order_by(TestAssignment.id.asc())
    )
    assignments = rows.all()
    member_out = [
        TestAssignedMemberOut(
            user_id=assignment.user_id,
            username=user.username,
            avatar_color=avatar_color,
            status=assignment.status,
            completed_at=assignment.completed_at,
        )
        for assignment, user, avatar_color in assignments
    ]

    request_rows = await db.execute(
        select(TestReopenRequest.status)
        .join(TestAttempt, TestAttempt.id == TestReopenRequest.attempt_id)
        .join(TestAssignment, TestAssignment.id == TestAttempt.assignment_id)
        .where(TestAssignment.test_id == test_id, TestReopenRequest.status == "pending")
    )
    reopen_pending_count = len(request_rows.all())

    if role == "child":
        assignment = next((a for a, _, _ in assignments if a.user_id == current_user_id), None)
        if assignment is None:
            return "published", member_out, reopen_pending_count
        if reopen_pending_count > 0 and assignment.status == "completed":
            return "reopen_requested", member_out, reopen_pending_count
        if assignment.status == "completed":
            return "completed", member_out, reopen_pending_count
        return "published", member_out, reopen_pending_count

    if reopen_pending_count > 0:
        return "reopen_requested", member_out, reopen_pending_count
    if assignments and all(assignment.status == "completed" for assignment, _, _ in assignments):
        return "completed", member_out, reopen_pending_count
    return "published", member_out, reopen_pending_count


async def _list_item(
    test: VideoTest,
    membership: FamilyMember,
    db: AsyncSession,
) -> TestListItemOut:
    status_value, members, reopen_pending_count = await _assignment_status_for_test(
        test.id,
        membership.family_id,
        current_user_id=membership.user_id,
        role=membership.role,
        db=db,
    )
    return TestListItemOut(
        id=test.id,
        title=test.title,
        video_id=test.video_id,
        thumbnail_url=test.thumbnail_url,
        question_count=test.question_count,
        time_limit_min=max(test.time_limit_sec // 60, 1),
        max_xp=test.max_xp,
        status=status_value,
        availability_status=_availability_status(test.status),
        difficulty=(test.difficulty or "medium").strip().lower(),
        subtitle_source=test.subtitle_source,
        assigned_members=members,
        reopen_pending_count=reopen_pending_count,
        created_at=test.created_at,
    )


async def _validate_test_access(
    *,
    test_id: int,
    membership: FamilyMember,
    db: AsyncSession,
) -> VideoTest:
    test = (
        await db.execute(
            select(VideoTest).where(
                VideoTest.id == test_id,
                VideoTest.family_id == membership.family_id,
            )
        )
    ).scalar_one_or_none()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    if membership.role == "child":
        assignment = (
            await db.execute(
                select(TestAssignment).where(
                    TestAssignment.test_id == test_id,
                    TestAssignment.user_id == membership.user_id,
                    TestAssignment.family_id == membership.family_id,
                )
            )
        ).scalar_one_or_none()
        if not assignment:
            raise HTTPException(status_code=403, detail="Test not assigned to you")

    return test


@router.post("/{family_id}/tests/preview", response_model=TestPreviewOut)
async def preview_test(
    body: TestPreviewRequest,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> TestPreviewOut:
    del db
    try:
        subtitle = await build_subtitle_payload(body.youtube_url)
    except SubtitleUnavailableError as exc:
        raise _subtitle_http_error(exc) from exc
    questions = await generate_quiz_questions(
        transcript=subtitle.raw_transcript,
        title=subtitle.title,
        question_count=body.question_count,
        difficulty=body.difficulty,
    )
    words = len(subtitle.raw_transcript.split())
    preview = subtitle.raw_transcript[:360] + ("..." if len(subtitle.raw_transcript) > 360 else "")
    return TestPreviewOut(
        title=subtitle.title,
        youtube_url=subtitle.youtube_url,
        video_id=subtitle.video_id,
        thumbnail_url=subtitle.thumbnail_url,
        subtitle_source=subtitle.subtitle_source,
        transcript_word_count=words,
        transcript_preview=preview,
        raw_transcript=subtitle.raw_transcript,
        questions=questions,
    )


@router.post("/{family_id}/tests/preview/subtitle", response_model=TestSubtitlePreviewOut)
async def preview_subtitle(
    body: TestSubtitlePreviewRequest,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> TestSubtitlePreviewOut:
    del parent_member
    del db
    try:
        subtitle = await build_subtitle_payload(body.youtube_url)
    except SubtitleUnavailableError as exc:
        raise _subtitle_http_error(exc) from exc
    words = len(subtitle.raw_transcript.split())
    preview = subtitle.raw_transcript[:360] + ("..." if len(subtitle.raw_transcript) > 360 else "")
    return TestSubtitlePreviewOut(
        title=subtitle.title,
        youtube_url=subtitle.youtube_url,
        video_id=subtitle.video_id,
        thumbnail_url=subtitle.thumbnail_url,
        subtitle_source=subtitle.subtitle_source,
        transcript_word_count=words,
        transcript_preview=preview,
        raw_transcript=subtitle.raw_transcript,
    )


@router.post("/{family_id}/tests/preview/questions", response_model=TestGenerateQuestionsOut)
async def preview_questions_from_transcript(
    body: TestGenerateQuestionsRequest,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> TestGenerateQuestionsOut:
    del parent_member
    del db
    questions = await generate_quiz_questions(
        transcript=body.raw_transcript,
        title=body.title,
        question_count=body.question_count,
        difficulty=body.difficulty,
    )
    return TestGenerateQuestionsOut(questions=questions)


@router.post("/{family_id}/tests/preview/regenerate-question", response_model=TestQuestionDraft)
async def regenerate_preview_question(
    body: TestRegenerateQuestionRequest,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> TestQuestionDraft:
    del parent_member
    del db
    return await generate_single_quiz_question(
        transcript=body.raw_transcript,
        title=body.title,
        existing_questions=body.existing_questions,
        target_question_text=body.target_question_text,
        difficulty=body.difficulty,
    )


@router.post("/{family_id}/tests", response_model=TestListItemOut, status_code=status.HTTP_201_CREATED)
async def publish_test(
    body: TestPublishRequest,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> TestListItemOut:
    child_rows = await db.execute(
        select(FamilyMember).where(
            FamilyMember.family_id == parent_member.family_id,
            FamilyMember.role == "child",
        )
    )
    children = {member.user_id: member for member in child_rows.scalars().all()}
    requested_ids = list(dict.fromkeys(body.assigned_user_ids))
    if not requested_ids:
        raise HTTPException(status_code=400, detail="At least one child must be assigned")
    invalid_ids = [user_id for user_id in requested_ids if user_id not in children]
    if invalid_ids:
        raise HTTPException(status_code=400, detail="One or more assigned users are invalid")

    video_test = VideoTest(
        family_id=parent_member.family_id,
        created_by=parent_member.user_id,
        title=body.title,
        youtube_url=body.youtube_url,
        video_id=body.video_id,
        thumbnail_url=body.thumbnail_url,
        subtitle_source=body.subtitle_source,
        raw_transcript=body.raw_transcript,
        time_limit_sec=body.time_limit_min * 60,
        max_xp=body.max_xp,
        question_count=body.question_count,
        difficulty=body.difficulty,
        status="active",
    )
    db.add(video_test)
    await db.flush()

    for order, question in enumerate(body.questions, start=1):
        db.add(
            TestQuestion(
                test_id=video_test.id,
                question_order=order,
                question_text=question.question_text,
                option_a=question.options[0],
                option_b=question.options[1],
                option_c=question.options[2],
                option_d=question.options[3],
                correct_option=_option_label(question.correct_option),
                explanation=question.explanation,
            )
        )

    for user_id in requested_ids:
        db.add(
            TestAssignment(
                test_id=video_test.id,
                family_id=parent_member.family_id,
                user_id=user_id,
                status="pending",
            )
        )

    db.add(
        ActivityLog(
            family_id=parent_member.family_id,
            user_id=parent_member.user_id,
            event_type="test_published",
            payload={"test_id": video_test.id, "title": video_test.title},
            is_audit=True,
        )
    )
    await db.commit()
    await db.refresh(video_test)
    await emit_family_event(
        parent_member.family_id,
        "test_assigned",
        {"testId": video_test.id, "assignedUserIds": requested_ids},
    )
    return await _list_item(video_test, parent_member, db)


@router.get("/{family_id}/tests", response_model=TestPageOut)
async def list_tests(
    membership: FamilyMember = Depends(get_active_membership),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> TestPageOut:
    created_before = _parse_cursor(cursor)

    base = select(VideoTest).where(
        VideoTest.family_id == membership.family_id,
        VideoTest.status != "deleted",
    )
    if created_before:
        base = base.where(VideoTest.created_at < created_before)
    if search:
        term = f"%{search.strip().lower()}%"
        base = base.where(func.lower(VideoTest.title).like(term))

    if membership.role == "child":
        base = base.join(TestAssignment, TestAssignment.test_id == VideoTest.id).where(
            TestAssignment.user_id == membership.user_id
        )

    rows = await db.execute(base.order_by(VideoTest.created_at.desc(), VideoTest.id.desc()).limit(limit + 1))
    all_tests = rows.scalars().all()
    has_more = len(all_tests) > limit
    page_tests = all_tests[:limit]

    items: list[TestListItemOut] = []
    for test in page_tests:
        item = await _list_item(test, membership, db)
        if status_filter and status_filter != "all":
            if status_filter in {"published", "open"}:
                if item.status not in {"published", "reopen_requested"}:
                    continue
            elif status_filter == "inactive":
                if item.availability_status != "inactive":
                    continue
            elif status_filter == "completed":
                if item.status not in {"completed", "reopen_requested"}:
                    continue
            elif item.status != status_filter:
                continue
        items.append(item)

    total_query = select(func.count(VideoTest.id)).where(
        VideoTest.family_id == membership.family_id,
        VideoTest.status != "deleted",
    )
    if membership.role == "child":
        total_query = (
            select(func.count(VideoTest.id))
            .select_from(VideoTest)
            .join(TestAssignment, TestAssignment.test_id == VideoTest.id)
            .where(
                VideoTest.family_id == membership.family_id,
                VideoTest.status != "deleted",
                TestAssignment.user_id == membership.user_id,
            )
        )
    total = int((await db.execute(total_query)).scalar_one())

    next_cursor = None
    if has_more and page_tests:
        next_cursor = page_tests[-1].created_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    return TestPageOut(items=items, next_cursor=next_cursor, total=total)


@router.post("/{family_id}/tests/{test_id}/start", response_model=TestAttemptStartOut)
async def start_attempt(
    test_id: int,
    current_user: User = Depends(get_current_user),
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> TestAttemptStartOut:
    if membership.role != "child":
        raise HTTPException(status_code=403, detail="Only children can take tests")

    test = await _validate_test_access(test_id=test_id, membership=membership, db=db)
    if _availability_status(test.status) != "active":
        raise HTTPException(status_code=400, detail="Test is inactive")
    assignment = (
        await db.execute(
            select(TestAssignment).where(
                TestAssignment.test_id == test_id,
                TestAssignment.family_id == membership.family_id,
                TestAssignment.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Test assignment not found")
    if assignment.status == "completed":
        raise HTTPException(status_code=400, detail="Test already completed")

    attempt = (
        await db.execute(
            select(TestAttempt)
            .where(TestAttempt.assignment_id == assignment.id, TestAttempt.submitted_at.is_(None))
            .order_by(TestAttempt.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if not attempt:
        latest_attempt = (
            await db.execute(
                select(func.max(TestAttempt.attempt_number)).where(TestAttempt.assignment_id == assignment.id)
            )
        ).scalar_one()
        attempt = TestAttempt(assignment_id=assignment.id, attempt_number=(latest_attempt or 0) + 1)
        db.add(attempt)
        await db.flush()

    question_rows = await db.execute(
        select(TestQuestion)
        .where(TestQuestion.test_id == test.id)
        .order_by(TestQuestion.question_order.asc(), TestQuestion.id.asc())
    )
    questions = [
        TestQuestionForAttemptOut(
            id=question.id,
            question_order=question.question_order,
            question_text=question.question_text,
            options=[question.option_a, question.option_b, question.option_c, question.option_d],
        )
        for question in question_rows.scalars().all()
    ]

    await db.commit()
    return TestAttemptStartOut(
        test_id=test.id,
        assignment_id=assignment.id,
        attempt_id=attempt.id,
        title=test.title,
        video_id=test.video_id,
        youtube_url=test.youtube_url,
        question_count=test.question_count,
        time_limit_sec=test.time_limit_sec,
        max_xp=test.max_xp,
        questions=questions,
    )


@router.post("/{family_id}/tests/{test_id}/submit", response_model=TestSubmitOut)
async def submit_attempt(
    test_id: int,
    body: TestSubmitRequest,
    current_user: User = Depends(get_current_user),
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> TestSubmitOut:
    if membership.role != "child":
        raise HTTPException(status_code=403, detail="Only children can submit tests")

    test = await _validate_test_access(test_id=test_id, membership=membership, db=db)
    assignment = (
        await db.execute(
            select(TestAssignment).where(
                TestAssignment.test_id == test_id,
                TestAssignment.family_id == membership.family_id,
                TestAssignment.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Test assignment not found")
    if assignment.status == "completed":
        raise HTTPException(status_code=400, detail="Test already completed")

    attempt = (
        await db.execute(
            select(TestAttempt).where(
                TestAttempt.id == body.attempt_id,
                TestAttempt.assignment_id == assignment.id,
            )
        )
    ).scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if attempt.submitted_at is not None:
        raise HTTPException(status_code=400, detail="Attempt already submitted")

    question_rows = await db.execute(
        select(TestQuestion)
        .where(TestQuestion.test_id == test.id)
        .order_by(TestQuestion.question_order.asc(), TestQuestion.id.asc())
    )
    questions = question_rows.scalars().all()

    question_by_id = {question.id: question for question in questions}
    seen_question_ids: set[int] = set()
    correct = 0

    for answer in body.answers:
        question = question_by_id.get(answer.question_id)
        if not question:
            raise HTTPException(status_code=400, detail="Answer contains an invalid questionId")
        if answer.question_id in seen_question_ids:
            raise HTTPException(status_code=400, detail="Duplicate answers are not allowed")
        seen_question_ids.add(answer.question_id)

        selected_label = _option_label(answer.selected_option)
        is_correct = selected_label == question.correct_option
        if is_correct:
            correct += 1
        db.add(
            TestAttemptAnswer(
                attempt_id=attempt.id,
                question_id=question.id,
                selected_option=selected_label,
                is_correct=is_correct,
            )
        )

    score_pct = (correct / len(questions)) * 100 if questions else 0.0
    xp_earned = int(round(test.max_xp * (score_pct / 100)))
    attempt.score_raw = correct
    attempt.score_pct = round(score_pct, 2)
    attempt.submitted_at = datetime.now(timezone.utc)
    attempt.xp_earned = xp_earned

    assignment.status = "completed"
    assignment.completed_at = datetime.now(timezone.utc)
    assignment.xp_earned = xp_earned

    level_row = await award_xp(
        family_id=membership.family_id,
        user_id=current_user.id,
        delta=xp_earned,
        reason=f"test_submit:{test.id}",
        source_id=attempt.id,
        db=db,
    )

    db.add(
        ActivityLog(
            family_id=membership.family_id,
            user_id=current_user.id,
            event_type="test_completed",
            payload={"test_id": test.id, "score_pct": round(score_pct, 2), "xp_earned": xp_earned},
            is_audit=False,
        )
    )
    await db.commit()
    await emit_family_event(
        membership.family_id,
        "test_completed",
        {"testId": test.id, "userId": current_user.id, "xpEarned": xp_earned},
    )
    await emit_family_event(
        membership.family_id,
        "leaderboard_update",
        {"userId": current_user.id},
    )
    return TestSubmitOut(
        test_id=test.id,
        attempt_id=attempt.id,
        assignment_id=assignment.id,
        score_raw=correct,
        score_pct=round(score_pct, 2),
        xp_earned=xp_earned,
        total_xp=level_row.total_xp,
        level=level_row.level,
    )


@router.patch("/{family_id}/tests/{test_id}/availability", response_model=TestListItemOut)
async def update_test_availability(
    test_id: int,
    body: TestAvailabilityUpdateIn,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> TestListItemOut:
    test = await _validate_test_access(test_id=test_id, membership=parent_member, db=db)
    test.status = "active" if body.is_active else "inactive"
    await db.commit()
    await db.refresh(test)
    await emit_family_event(
        parent_member.family_id,
        "test_updated",
        {"testId": test.id, "availabilityStatus": _availability_status(test.status)},
    )
    return await _list_item(test, parent_member, db)


@router.delete(
    "/{family_id}/tests/{test_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_test(
    test_id: int,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> Response:
    test = await _validate_test_access(test_id=test_id, membership=parent_member, db=db)
    test.status = "deleted"
    await db.commit()
    await emit_family_event(
        parent_member.family_id,
        "test_updated",
        {"testId": test.id, "availabilityStatus": "deleted"},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{family_id}/tests/{test_id}/attempts/{attempt_id}/review",
    response_model=TestAttemptReviewOut,
)
async def get_attempt_review(
    test_id: int,
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> TestAttemptReviewOut:
    test = await _validate_test_access(test_id=test_id, membership=membership, db=db)

    row = await db.execute(
        select(TestAttempt, TestAssignment)
        .join(TestAssignment, TestAssignment.id == TestAttempt.assignment_id)
        .where(
            TestAttempt.id == attempt_id,
            TestAssignment.test_id == test_id,
            TestAssignment.family_id == membership.family_id,
        )
    )
    result = row.one_or_none()
    if not result:
        raise HTTPException(status_code=404, detail="Attempt not found")

    attempt, assignment = result
    if membership.role == "child" and assignment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only review your own attempts")
    if attempt.submitted_at is None:
        raise HTTPException(status_code=400, detail="Attempt has not been submitted")

    answer_rows = await db.execute(
        select(TestAttemptAnswer).where(TestAttemptAnswer.attempt_id == attempt.id)
    )
    answers = {answer.question_id: answer for answer in answer_rows.scalars().all()}

    question_rows = await db.execute(
        select(TestQuestion)
        .where(TestQuestion.test_id == test.id)
        .order_by(TestQuestion.question_order.asc(), TestQuestion.id.asc())
    )
    review_questions: list[TestAttemptReviewQuestionOut] = []
    for question in question_rows.scalars().all():
        answer = answers.get(question.id)
        selected_label = answer.selected_option if answer else None
        selected_option = _option_index(selected_label) if selected_label else None
        correct_option = _option_index(question.correct_option)
        review_questions.append(
            TestAttemptReviewQuestionOut(
                question_id=question.id,
                question_order=question.question_order,
                question_text=question.question_text,
                options=[question.option_a, question.option_b, question.option_c, question.option_d],
                selected_option=selected_option,
                selected_label=selected_label,
                correct_option=correct_option,
                correct_label=question.correct_option,
                explanation=question.explanation,
                is_correct=answer.is_correct if answer else False,
            )
        )

    return TestAttemptReviewOut(
        test_id=test.id,
        attempt_id=attempt.id,
        title=test.title,
        submitted_at=attempt.submitted_at,
        score_raw=attempt.score_raw or 0,
        score_pct=attempt.score_pct or 0.0,
        xp_earned=attempt.xp_earned,
        max_xp=test.max_xp,
        total_questions=test.question_count,
        questions=review_questions,
    )


@router.post("/{family_id}/tests/{test_id}/reopen-request", response_model=TestReopenRequestOut, status_code=status.HTTP_201_CREATED)
async def create_reopen_request(
    test_id: int,
    body: TestReopenRequestIn,
    current_user: User = Depends(get_current_user),
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> TestReopenRequestOut:
    if membership.role != "child":
        raise HTTPException(status_code=403, detail="Only children can request reopen")

    await _validate_test_access(test_id=test_id, membership=membership, db=db)
    assignment = (
        await db.execute(
            select(TestAssignment).where(
                TestAssignment.test_id == test_id,
                TestAssignment.family_id == membership.family_id,
                TestAssignment.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if not assignment or assignment.status != "completed":
        raise HTTPException(status_code=400, detail="Only completed tests can request reopen")

    attempt = (
        await db.execute(
            select(TestAttempt)
            .where(TestAttempt.assignment_id == assignment.id, TestAttempt.submitted_at.is_not(None))
            .order_by(TestAttempt.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=400, detail="No submitted attempt found")

    existing_pending = (
        await db.execute(
            select(TestReopenRequest).where(
                TestReopenRequest.attempt_id == attempt.id,
                TestReopenRequest.status == "pending",
            )
        )
    ).scalar_one_or_none()
    if existing_pending:
        raise HTTPException(status_code=400, detail="Reopen request already pending")

    reopen = TestReopenRequest(
        attempt_id=attempt.id,
        requested_by=current_user.id,
        status="pending",
        reason=body.reason,
    )
    db.add(reopen)
    db.add(
        ActivityLog(
            family_id=membership.family_id,
            user_id=current_user.id,
            event_type="test_reopen_requested",
            payload={"test_id": test_id, "assignment_id": assignment.id},
            is_audit=False,
        )
    )
    await db.commit()
    await db.refresh(reopen)
    await emit_family_event(
        membership.family_id,
        "reopen_requested",
        {"testId": test_id, "requestId": reopen.id, "userId": current_user.id},
    )
    return TestReopenRequestOut(
        id=reopen.id,
        test_id=test_id,
        attempt_id=attempt.id,
        requested_by=reopen.requested_by,
        status=reopen.status,
        reason=reopen.reason,
        requested_at=reopen.requested_at,
        resolved_at=reopen.resolved_at,
        resolved_by=reopen.resolved_by,
    )


@router.get("/{family_id}/tests/{test_id}/reopen-requests", response_model=list[TestReopenRequestOut])
async def list_reopen_requests(
    test_id: int,
    status_filter: str | None = Query(default=None, alias="status"),
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> list[TestReopenRequestOut]:
    await _validate_test_access(test_id=test_id, membership=parent_member, db=db)

    stmt = (
        select(TestReopenRequest, TestAttempt, TestAssignment)
        .join(TestAttempt, TestAttempt.id == TestReopenRequest.attempt_id)
        .join(TestAssignment, TestAssignment.id == TestAttempt.assignment_id)
        .where(
            TestAssignment.test_id == test_id,
            TestAssignment.family_id == parent_member.family_id,
        )
    )
    if status_filter in {"pending", "approved", "rejected"}:
        stmt = stmt.where(TestReopenRequest.status == status_filter)

    rows = await db.execute(stmt.order_by(TestReopenRequest.requested_at.desc(), TestReopenRequest.id.desc()))
    return [
        TestReopenRequestOut(
            id=reopen.id,
            test_id=test_id,
            attempt_id=attempt.id,
            requested_by=reopen.requested_by,
            status=reopen.status,
            reason=reopen.reason,
            requested_at=reopen.requested_at,
            resolved_at=reopen.resolved_at,
            resolved_by=reopen.resolved_by,
        )
        for reopen, attempt, _ in rows.all()
    ]


@router.post("/{family_id}/tests/{test_id}/reopen-requests/{request_id}/resolve", response_model=TestReopenResolveOut)
async def resolve_reopen_request(
    test_id: int,
    request_id: int,
    body: TestReopenResolveIn,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> TestReopenResolveOut:
    await _validate_test_access(test_id=test_id, membership=parent_member, db=db)

    row = await db.execute(
        select(TestReopenRequest, TestAttempt, TestAssignment)
        .join(TestAttempt, TestAttempt.id == TestReopenRequest.attempt_id)
        .join(TestAssignment, TestAssignment.id == TestAttempt.assignment_id)
        .where(
            TestReopenRequest.id == request_id,
            TestAssignment.test_id == test_id,
            TestAssignment.family_id == parent_member.family_id,
        )
    )
    result = row.one_or_none()
    if not result:
        raise HTTPException(status_code=404, detail="Reopen request not found")

    reopen, attempt, assignment = result
    if reopen.status != "pending":
        raise HTTPException(status_code=400, detail="Reopen request already resolved")

    reopen.status = "approved" if body.decision == "approve" else "rejected"
    reopen.resolved_at = datetime.now(timezone.utc)
    reopen.resolved_by = parent_member.user_id

    xp_delta = 0
    if body.decision == "approve":
        if assignment.xp_earned > 0:
            xp_delta = -assignment.xp_earned
            level_state = await award_xp(
                family_id=assignment.family_id,
                user_id=assignment.user_id,
                delta=xp_delta,
                reason=f"test_reopen_revoke:{test_id}",
                source_id=attempt.id,
                db=db,
            )
            total_xp = level_state.total_xp
            level = level_state.level
        else:
            current = (
                await db.execute(
                    select(UserFamilyLevel).where(
                        UserFamilyLevel.family_id == assignment.family_id,
                        UserFamilyLevel.user_id == assignment.user_id,
                    )
                )
            ).scalar_one_or_none()
            total_xp = current.total_xp if current else 0
            level = current.level if current else 1

        assignment.status = "pending"
        assignment.completed_at = None
        assignment.reopened_at = datetime.now(timezone.utc)
        assignment.xp_earned = 0
    else:
        current = (
            await db.execute(
                select(UserFamilyLevel).where(
                    UserFamilyLevel.family_id == assignment.family_id,
                    UserFamilyLevel.user_id == assignment.user_id,
                )
            )
        ).scalar_one_or_none()
        total_xp = current.total_xp if current else 0
        level = current.level if current else 1

    db.add(
        ActivityLog(
            family_id=parent_member.family_id,
            user_id=parent_member.user_id,
            event_type="test_reopen_resolved",
            payload={"test_id": test_id, "request_id": reopen.id, "decision": body.decision, "xp_delta": xp_delta},
            is_audit=True,
        )
    )
    await db.commit()
    await emit_family_event(
        parent_member.family_id,
        "reopen_resolved",
        {
            "testId": test_id,
            "requestId": reopen.id,
            "decision": body.decision,
            "userId": assignment.user_id,
            "xpDelta": xp_delta,
        },
    )
    if xp_delta != 0:
        await emit_family_event(
            parent_member.family_id,
            "leaderboard_update",
            {"userId": assignment.user_id},
        )
    return TestReopenResolveOut(
        request=TestReopenRequestOut(
            id=reopen.id,
            test_id=test_id,
            attempt_id=attempt.id,
            requested_by=reopen.requested_by,
            status=reopen.status,
            reason=reopen.reason,
            requested_at=reopen.requested_at,
            resolved_at=reopen.resolved_at,
            resolved_by=reopen.resolved_by,
        ),
        assignment_status=assignment.status,
        xp_delta=xp_delta,
        total_xp=total_xp,
        level=level,
    )
