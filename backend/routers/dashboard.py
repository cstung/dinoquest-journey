from __future__ import annotations

import base64
import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.dependencies import get_active_membership, require_parent
from backend.models import (
    ActivityLog,
    FamilyMember,
    FamilyMoodCheckin,
    FamilyPin,
    FamilyPinAcknowledgement,
    FamilyWallComment,
    FamilyWallPost,
    FamilyWallReaction,
    QuestAssignment,
    TestAssignment,
    User,
    UserFamilyLevel,
    XpEvent,
)
from backend.realtime import emit_family_event
from backend.schemas.dashboard import (
    BoostCreate,
    CommentCreate,
    CommentOut,
    CommentsOut,
    DashboardStatsOut,
    MoodCreate,
    MoodCheckinOut,
    MoodTodayOut,
    PinAcknowledgementOut,
    PinCreate,
    PinOut,
    PinsOut,
    ReactionCreate,
    ReactionOut,
    ReactionUsersOut,
    TagOut,
    WallFeedOut,
    WallPostCreate,
    WallPostOut,
)

router = APIRouter()

POST_TYPES = {"activity", "shoutout", "photo", "boost", "weekly_recap"}


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _display_name(member: FamilyMember | None, user: User | None) -> str:
    return (member.nickname if member and member.nickname else None) or (user.username if user else None) or "Member"


async def _family_members(db: AsyncSession, family_id: int) -> dict[int, tuple[FamilyMember, User | None]]:
    rows = await db.execute(
        select(FamilyMember, User)
        .outerjoin(User, User.id == FamilyMember.user_id)
        .where(FamilyMember.family_id == family_id)
    )
    return {member.user_id: (member, user) for member, user in rows.all()}


async def _reaction_counts(db: AsyncSession, post_id: int, current_user_id: int) -> list[ReactionOut]:
    rows = await db.execute(
        select(
            FamilyWallReaction.emoji,
            func.count(FamilyWallReaction.id),
            func.max(case((FamilyWallReaction.user_id == current_user_id, 1), else_=0)),
        )
        .where(FamilyWallReaction.post_id == post_id)
        .group_by(FamilyWallReaction.emoji)
        .order_by(FamilyWallReaction.emoji)
    )
    return [
        ReactionOut(emoji=emoji, count=int(count), reacted_by_me=bool(reacted_by_me))
        for emoji, count, reacted_by_me in rows.all()
    ]


async def _comment_count(db: AsyncSession, post_id: int) -> int:
    return int(
        (
            await db.execute(
                select(func.count(FamilyWallComment.id)).where(FamilyWallComment.post_id == post_id)
            )
        ).scalar_one()
    )


async def _serialize_comment(db: AsyncSession, family_id: int, comment: FamilyWallComment) -> CommentOut:
    members = await _family_members(db, family_id)
    member, user = members.get(comment.author_id, (None, await db.get(User, comment.author_id)))  # type: ignore[assignment]
    return CommentOut(
        id=comment.id,
        post_id=comment.post_id,
        author_id=comment.author_id,
        author_nickname=_display_name(member, user),
        author_color=(member.avatar_color if member else None) or "#1CB0F6",
        text=comment.text,
        created_at=comment.created_at,
    )


async def _serialize_post(db: AsyncSession, post: FamilyWallPost, current_user_id: int) -> WallPostOut:
    members = await _family_members(db, post.family_id)
    author_member, author_user = (None, None)
    if post.author_id is not None:
        author_member, author_user = members.get(post.author_id, (None, await db.get(User, post.author_id)))

    tags = []
    for user_id in post.tagged_user_ids or []:
        member, user = members.get(user_id, (None, await db.get(User, user_id)))
        tags.append(TagOut(user_id=user_id, nickname=_display_name(member, user)))

    return WallPostOut(
        id=post.id,
        author_id=post.author_id,
        author_nickname=_display_name(author_member, author_user) if post.author_id is not None else None,
        author_color=(author_member.avatar_color if author_member else None) or "#1CB0F6",
        post_type=post.post_type,
        content=post.content,
        image_url=post.image_url,
        sticker_url=post.sticker_url,
        is_boosted=post.is_boosted,
        tags=tags,
        reaction_counts=await _reaction_counts(db, post.id, current_user_id),
        comment_count=await _comment_count(db, post.id),
        created_at=post.created_at,
    )


async def _require_post(db: AsyncSession, family_id: int, post_id: int) -> FamilyWallPost:
    post = (
        await db.execute(
            select(FamilyWallPost).where(FamilyWallPost.id == post_id, FamilyWallPost.family_id == family_id)
        )
    ).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


async def _emit(family_id: int, event: str, payload: Any) -> None:
    await emit_family_event(family_id, event, jsonable_encoder(payload, by_alias=True))


@router.get("/{family_id}/dashboard/feed", response_model=WallFeedOut)
async def dashboard_feed(
    membership: FamilyMember = Depends(get_active_membership),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> WallFeedOut:
    offset = (page - 1) * limit
    rows = await db.execute(
        select(FamilyWallPost)
        .where(FamilyWallPost.family_id == membership.family_id)
        .order_by(FamilyWallPost.created_at.desc(), FamilyWallPost.id.desc())
        .offset(offset)
        .limit(limit + 1)
    )
    items = rows.scalars().all()
    return WallFeedOut(
        posts=[await _serialize_post(db, post, membership.user_id) for post in items[:limit]],
        has_more=len(items) > limit,
    )


@router.post("/{family_id}/wall-posts", response_model=WallPostOut, status_code=status.HTTP_201_CREATED)
async def create_wall_post(
    request: Request,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> WallPostOut:
    content_type = request.headers.get("content-type", "")
    image_url: str | None = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        content = str(form.get("content") or "").strip()
        post_type = str(form.get("postType") or "photo").strip()
        sticker_url = str(form.get("stickerUrl") or "").strip() or None
        raw_tags = form.get("tags") or "[]"
        try:
            tagged_user_ids = [int(item) for item in json.loads(str(raw_tags))]
        except (TypeError, ValueError, json.JSONDecodeError):
            tagged_user_ids = []
        image = form.get("image")
        if image is not None and hasattr(image, "read"):
            raw = await image.read()
            if raw:
                media_type = getattr(image, "content_type", None) or "application/octet-stream"
                image_url = f"data:{media_type};base64,{base64.b64encode(raw).decode('ascii')}"
    else:
        payload = await request.json()
        body = WallPostCreate.model_validate(payload)
        content = body.content.strip()
        post_type = body.post_type.strip()
        sticker_url = body.sticker_url
        tagged_user_ids = body.tagged_user_ids

    if post_type not in POST_TYPES:
        raise HTTPException(status_code=422, detail="Invalid post type")
    if not content and not sticker_url and not image_url:
        raise HTTPException(status_code=422, detail="Post content is required")

    post = FamilyWallPost(
        family_id=membership.family_id,
        author_id=membership.user_id,
        post_type=post_type,
        content=content,
        image_url=image_url,
        sticker_url=sticker_url,
        tagged_user_ids=tagged_user_ids,
        is_boosted=False,
    )
    db.add(post)
    db.add(
        ActivityLog(
            family_id=membership.family_id,
            user_id=membership.user_id,
            event_type="wall_post_created",
            payload={"post_type": post_type},
            is_audit=False,
        )
    )
    await db.commit()
    await db.refresh(post)
    serialized = await _serialize_post(db, post, membership.user_id)
    await _emit(membership.family_id, "wall_post_created", serialized)
    return serialized


@router.delete("/{family_id}/wall-posts/{post_id}", status_code=status.HTTP_200_OK)
async def delete_wall_post(
    post_id: int,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    post = await _require_post(db, membership.family_id, post_id)
    if membership.role != "parent" and post.author_id != membership.user_id:
        raise HTTPException(status_code=403, detail="Cannot delete this post")
    await db.execute(delete(FamilyWallComment).where(FamilyWallComment.post_id == post.id))
    await db.execute(delete(FamilyWallReaction).where(FamilyWallReaction.post_id == post.id))
    await db.delete(post)
    await db.commit()


@router.post("/{family_id}/wall-posts/{post_id}/reactions", status_code=status.HTTP_200_OK)
async def add_reaction(
    post_id: int,
    body: ReactionCreate,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _require_post(db, membership.family_id, post_id)
    existing = (
        await db.execute(
            select(FamilyWallReaction).where(
                FamilyWallReaction.post_id == post_id,
                FamilyWallReaction.user_id == membership.user_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.emoji = body.emoji
    else:
        db.add(FamilyWallReaction(post_id=post_id, user_id=membership.user_id, emoji=body.emoji))
    await db.commit()
    count = int(
        (
            await db.execute(
                select(func.count(FamilyWallReaction.id)).where(
                    FamilyWallReaction.post_id == post_id,
                    FamilyWallReaction.emoji == body.emoji,
                )
            )
        ).scalar_one()
    )
    await _emit(
        membership.family_id,
        "wall_reaction_updated",
        {"postId": post_id, "emoji": body.emoji, "count": count, "reactedByMe": True},
    )


@router.delete("/{family_id}/wall-posts/{post_id}/reactions", status_code=status.HTTP_200_OK)
async def remove_reaction(
    post_id: int,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _require_post(db, membership.family_id, post_id)
    existing = (
        await db.execute(
            select(FamilyWallReaction).where(
                FamilyWallReaction.post_id == post_id,
                FamilyWallReaction.user_id == membership.user_id,
            )
        )
    ).scalar_one_or_none()
    emoji = existing.emoji if existing else None
    if existing:
        await db.delete(existing)
        await db.commit()
    if emoji:
        count = int(
            (
                await db.execute(
                    select(func.count(FamilyWallReaction.id)).where(
                        FamilyWallReaction.post_id == post_id,
                        FamilyWallReaction.emoji == emoji,
                    )
                )
            ).scalar_one()
        )
        await _emit(
            membership.family_id,
            "wall_reaction_updated",
            {"postId": post_id, "emoji": emoji, "count": count, "reactedByMe": False},
        )


@router.get("/{family_id}/wall-posts/{post_id}/comments", response_model=CommentsOut)
async def list_comments(
    post_id: int,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> CommentsOut:
    await _require_post(db, membership.family_id, post_id)
    comments = (
        await db.execute(
            select(FamilyWallComment)
            .where(FamilyWallComment.post_id == post_id)
            .order_by(FamilyWallComment.created_at.asc(), FamilyWallComment.id.asc())
        )
    ).scalars().all()
    return CommentsOut(comments=[await _serialize_comment(db, membership.family_id, comment) for comment in comments])


@router.post("/{family_id}/wall-posts/{post_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
async def create_comment(
    post_id: int,
    body: CommentCreate,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> CommentOut:
    await _require_post(db, membership.family_id, post_id)
    comment = FamilyWallComment(post_id=post_id, author_id=membership.user_id, text=body.text)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    serialized = await _serialize_comment(db, membership.family_id, comment)
    await _emit(membership.family_id, "wall_comment_added", {"postId": post_id, "comment": serialized})
    return serialized


@router.delete("/{family_id}/wall-posts/{post_id}/comments/{comment_id}", status_code=status.HTTP_200_OK)
async def delete_comment(
    post_id: int,
    comment_id: int,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _require_post(db, membership.family_id, post_id)
    comment = (
        await db.execute(
            select(FamilyWallComment).where(FamilyWallComment.id == comment_id, FamilyWallComment.post_id == post_id)
        )
    ).scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if membership.role != "parent" and comment.author_id != membership.user_id:
        raise HTTPException(status_code=403, detail="Cannot delete this comment")
    await db.delete(comment)
    await db.commit()


@router.post("/{family_id}/wall-posts/{post_id}/boost", status_code=status.HTTP_200_OK)
async def boost_post(
    post_id: int,
    body: BoostCreate,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> None:
    post = await _require_post(db, parent_member.family_id, post_id)
    post.is_boosted = True
    db.add(
        ActivityLog(
            family_id=parent_member.family_id,
            user_id=parent_member.user_id,
            event_type="wall_post_boosted",
            payload={"post_id": post_id, "xp": body.xp, "message": body.message},
            is_audit=False,
        )
    )
    await db.commit()
    await _emit(parent_member.family_id, "wall_post_boosted", {"postId": post_id, "xp": body.xp})


@router.get("/{family_id}/wall-posts/{post_id}/reactions/{emoji}/users", response_model=ReactionUsersOut)
async def reaction_users(
    post_id: int,
    emoji: str,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> ReactionUsersOut:
    await _require_post(db, membership.family_id, post_id)
    members = await _family_members(db, membership.family_id)
    rows = await db.execute(
        select(FamilyWallReaction.user_id).where(
            FamilyWallReaction.post_id == post_id,
            FamilyWallReaction.emoji == emoji,
        )
    )
    nicknames = []
    for user_id in rows.scalars().all():
        member, user = members.get(user_id, (None, await db.get(User, user_id)))
        nicknames.append(_display_name(member, user))
    return ReactionUsersOut(nicknames=nicknames)


@router.get("/{family_id}/mood-checkins/today", response_model=MoodTodayOut)
async def today_moods(
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> MoodTodayOut:
    rows = await db.execute(
        select(FamilyMoodCheckin).where(
            FamilyMoodCheckin.family_id == membership.family_id,
            FamilyMoodCheckin.checkin_date == _today(),
            or_shared_or_self(membership.user_id),
        )
    )
    return MoodTodayOut(
        checkins=[MoodCheckinOut(user_id=row.user_id, mood=row.mood) for row in rows.scalars().all()]
    )


def or_shared_or_self(user_id: int):
    return (FamilyMoodCheckin.shared.is_(True)) | (FamilyMoodCheckin.user_id == user_id)


@router.post("/{family_id}/mood-checkins", status_code=status.HTTP_200_OK)
async def save_mood(
    body: MoodCreate,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    checkin_date = _today()
    row = (
        await db.execute(
            select(FamilyMoodCheckin).where(
                FamilyMoodCheckin.family_id == membership.family_id,
                FamilyMoodCheckin.user_id == membership.user_id,
                FamilyMoodCheckin.checkin_date == checkin_date,
            )
        )
    ).scalar_one_or_none()
    if row:
        row.mood = body.mood
        row.shared = body.shared
    else:
        db.add(
            FamilyMoodCheckin(
                family_id=membership.family_id,
                user_id=membership.user_id,
                mood=body.mood,
                shared=body.shared,
                checkin_date=checkin_date,
            )
        )
    await db.commit()
    await _emit(membership.family_id, "mood_checkin", {"userId": membership.user_id, "mood": body.mood})


@router.get("/{family_id}/pins", response_model=PinsOut)
async def list_pins(
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> PinsOut:
    now = datetime.now(timezone.utc)
    pins = (
        await db.execute(
            select(FamilyPin)
            .where(
                FamilyPin.family_id == membership.family_id,
                (FamilyPin.expires_at.is_(None)) | (FamilyPin.expires_at > now),
            )
            .order_by(FamilyPin.created_at.desc(), FamilyPin.id.desc())
        )
    ).scalars().all()
    members = await _family_members(db, membership.family_id)
    total_members = len(members)
    out: list[PinOut] = []
    for pin in pins:
        ack_rows = await db.execute(
            select(FamilyPinAcknowledgement.user_id).where(FamilyPinAcknowledgement.pin_id == pin.id)
        )
        acknowledgements = []
        for user_id in ack_rows.scalars().all():
            member, user = members.get(user_id, (None, await db.get(User, user_id)))
            acknowledgements.append(PinAcknowledgementOut(user_id=user_id, nickname=_display_name(member, user)))
        creator_member, creator_user = members.get(pin.created_by_user_id, (None, await db.get(User, pin.created_by_user_id)))
        out.append(
            PinOut(
                id=pin.id,
                message=pin.message,
                created_by=_display_name(creator_member, creator_user),
                expires_at=pin.expires_at,
                acknowledgements=acknowledgements,
                total_members=total_members,
            )
        )
    return PinsOut(pins=out)


@router.post("/{family_id}/pins", response_model=PinOut, status_code=status.HTTP_201_CREATED)
async def create_pin(
    body: PinCreate,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> PinOut:
    active_count = int(
        (
            await db.execute(
                select(func.count(FamilyPin.id)).where(
                    FamilyPin.family_id == parent_member.family_id,
                    (FamilyPin.expires_at.is_(None)) | (FamilyPin.expires_at > datetime.now(timezone.utc)),
                )
            )
        ).scalar_one()
    )
    if active_count >= 5:
        raise HTTPException(status_code=409, detail="Maximum 5 pins allowed")
    pin = FamilyPin(
        family_id=parent_member.family_id,
        created_by_user_id=parent_member.user_id,
        message=body.message,
        expires_at=body.expires_at,
    )
    db.add(pin)
    await db.commit()
    await db.refresh(pin)
    await _emit(parent_member.family_id, "pin_created", {"pinId": pin.id})
    pins = await list_pins(parent_member, db)
    return next(item for item in pins.pins if item.id == pin.id)


@router.post("/{family_id}/pins/{pin_id}/acknowledge", status_code=status.HTTP_200_OK)
async def acknowledge_pin(
    pin_id: int,
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> None:
    pin = (
        await db.execute(
            select(FamilyPin).where(FamilyPin.id == pin_id, FamilyPin.family_id == membership.family_id)
        )
    ).scalar_one_or_none()
    if not pin:
        raise HTTPException(status_code=404, detail="Pin not found")
    existing = (
        await db.execute(
            select(FamilyPinAcknowledgement).where(
                FamilyPinAcknowledgement.pin_id == pin_id,
                FamilyPinAcknowledgement.user_id == membership.user_id,
            )
        )
    ).scalar_one_or_none()
    if not existing:
        db.add(FamilyPinAcknowledgement(pin_id=pin_id, user_id=membership.user_id))
        await db.commit()
    await _emit(membership.family_id, "pin_created", {"pinId": pin_id})


@router.delete("/{family_id}/pins/{pin_id}", status_code=status.HTTP_200_OK)
async def remove_pin(
    pin_id: int,
    parent_member: FamilyMember = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> None:
    pin = (
        await db.execute(
            select(FamilyPin).where(FamilyPin.id == pin_id, FamilyPin.family_id == parent_member.family_id)
        )
    ).scalar_one_or_none()
    if not pin:
        raise HTTPException(status_code=404, detail="Pin not found")
    await db.execute(delete(FamilyPinAcknowledgement).where(FamilyPinAcknowledgement.pin_id == pin.id))
    await db.delete(pin)
    await db.commit()
    await _emit(parent_member.family_id, "pin_removed", {"pinId": pin_id})


@router.get("/{family_id}/dashboard/stats", response_model=DashboardStatsOut)
async def dashboard_stats(
    membership: FamilyMember = Depends(get_active_membership),
    db: AsyncSession = Depends(get_db),
) -> DashboardStatsOut:
    since = datetime.now(timezone.utc) - timedelta(days=7)
    quests_completed = int(
        (
            await db.execute(
                select(func.count(QuestAssignment.id)).where(
                    QuestAssignment.family_id == membership.family_id,
                    QuestAssignment.status == "completed",
                    QuestAssignment.completed_at >= since,
                )
            )
        ).scalar_one()
    )
    family_xp = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(XpEvent.delta), 0)).where(
                    XpEvent.family_id == membership.family_id,
                    XpEvent.created_at >= since,
                )
            )
        ).scalar_one()
    )
    best_streak = int(
        (
            await db.execute(
                select(func.coalesce(func.max(UserFamilyLevel.current_streak), 0)).where(
                    UserFamilyLevel.family_id == membership.family_id,
                )
            )
        ).scalar_one()
    )
    tests_taken = int(
        (
            await db.execute(
                select(func.count(TestAssignment.id)).where(
                    TestAssignment.family_id == membership.family_id,
                    TestAssignment.status == "completed",
                    TestAssignment.completed_at >= since,
                )
            )
        ).scalar_one()
    )
    return DashboardStatsOut(
        quests_completed_this_week=quests_completed,
        family_xp_this_week=family_xp,
        best_streak_active=best_streak,
        tests_taken_this_week=tests_taken,
    )
