from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator, model_validator

from backend.base_schema import APIModel


class TestQuestionDraft(APIModel):
    question_text: str
    options: list[str]
    correct_option: int = Field(ge=0, le=3)
    explanation: str | None = None

    @field_validator("question_text")
    @classmethod
    def validate_question_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Question text is required")
        return cleaned

    @field_validator("options")
    @classmethod
    def validate_options(cls, value: list[str]) -> list[str]:
        if len(value) != 4:
            raise ValueError("Exactly 4 options are required")
        cleaned = [option.strip() for option in value]
        if any(not option for option in cleaned):
            raise ValueError("Options cannot be empty")
        return cleaned


class TestPreviewRequest(APIModel):
    youtube_url: str
    question_count: int = Field(default=10, ge=3, le=30)
    difficulty: str = "medium"

    @field_validator("youtube_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("YouTube URL is required")
        return cleaned

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, value: str) -> str:
        lowered = value.strip().lower()
        if lowered not in {"easy", "medium", "hard"}:
            raise ValueError("difficulty must be easy, medium, or hard")
        return lowered


class TestSubtitlePreviewRequest(APIModel):
    youtube_url: str

    @field_validator("youtube_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("YouTube URL is required")
        return cleaned


class TestSubtitlePreviewOut(APIModel):
    title: str
    youtube_url: str
    video_id: str
    thumbnail_url: str
    subtitle_source: str
    transcript_word_count: int
    transcript_preview: str
    raw_transcript: str


class TestPreviewOut(APIModel):
    title: str
    youtube_url: str
    video_id: str
    thumbnail_url: str
    subtitle_source: str
    transcript_word_count: int
    transcript_preview: str
    raw_transcript: str
    questions: list[TestQuestionDraft]


class TestGenerateQuestionsRequest(APIModel):
    title: str
    raw_transcript: str
    question_count: int = Field(default=10, ge=3, le=30)
    difficulty: str = "medium"

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Test title is required")
        return cleaned

    @field_validator("raw_transcript")
    @classmethod
    def validate_raw_transcript(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Transcript is required")
        return cleaned

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, value: str) -> str:
        lowered = value.strip().lower()
        if lowered not in {"easy", "medium", "hard"}:
            raise ValueError("difficulty must be easy, medium, or hard")
        return lowered


class TestGenerateQuestionsOut(APIModel):
    questions: list[TestQuestionDraft]


class TestRegenerateQuestionRequest(APIModel):
    title: str
    raw_transcript: str
    existing_questions: list[str] = Field(default_factory=list)
    target_question_text: str | None = None
    difficulty: str = "medium"

    @field_validator("title")
    @classmethod
    def validate_regen_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Test title is required")
        return cleaned

    @field_validator("raw_transcript")
    @classmethod
    def validate_regen_transcript(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Transcript is required")
        return cleaned

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, value: str) -> str:
        lowered = value.strip().lower()
        if lowered not in {"easy", "medium", "hard"}:
            raise ValueError("difficulty must be easy, medium, or hard")
        return lowered


class TestPublishRequest(APIModel):
    title: str
    youtube_url: str
    video_id: str
    thumbnail_url: str | None = None
    subtitle_source: str = "youtube_auto"
    raw_transcript: str
    question_count: int = Field(ge=3, le=30)
    difficulty: str = "medium"
    time_limit_min: int = Field(default=30, ge=1, le=180)
    max_xp: int = Field(default=100, ge=1, le=10000)
    assigned_user_ids: list[int]
    questions: list[TestQuestionDraft]

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Test title is required")
        return cleaned

    @field_validator("raw_transcript")
    @classmethod
    def validate_transcript(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Transcript is required")
        return cleaned

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, value: str) -> str:
        lowered = value.strip().lower()
        if lowered not in {"easy", "medium", "hard"}:
            raise ValueError("difficulty must be easy, medium, or hard")
        return lowered

    @model_validator(mode="after")
    def validate_questions_count(self) -> "TestPublishRequest":
        if len(self.questions) != self.question_count:
            raise ValueError("questionCount must match the number of questions provided")
        if len(set(self.assigned_user_ids)) != len(self.assigned_user_ids):
            raise ValueError("assignedUserIds cannot contain duplicates")
        return self


class TestAssignedMemberOut(APIModel):
    user_id: int
    username: str
    avatar_color: str | None
    status: str
    completed_at: datetime | None


class TestListItemOut(APIModel):
    id: int
    title: str
    video_id: str
    thumbnail_url: str | None
    question_count: int
    time_limit_min: int
    max_xp: int
    status: str
    availability_status: str
    difficulty: str
    subtitle_source: str
    assigned_members: list[TestAssignedMemberOut]
    reopen_pending_count: int
    created_at: datetime


class TestPageOut(APIModel):
    items: list[TestListItemOut]
    next_cursor: str | None
    total: int


class TestQuestionForAttemptOut(APIModel):
    id: int
    question_order: int
    question_text: str
    options: list[str]


class TestAttemptStartOut(APIModel):
    test_id: int
    assignment_id: int
    attempt_id: int
    title: str
    video_id: str
    youtube_url: str
    question_count: int
    time_limit_sec: int
    max_xp: int
    questions: list[TestQuestionForAttemptOut]


class TestAnswerIn(APIModel):
    question_id: int
    selected_option: int = Field(ge=0, le=3)


class TestSubmitRequest(APIModel):
    attempt_id: int
    answers: list[TestAnswerIn]


class TestSubmitOut(APIModel):
    test_id: int
    attempt_id: int
    assignment_id: int
    score_raw: int
    score_pct: float
    xp_earned: int
    total_xp: int
    level: int


class TestAttemptReviewQuestionOut(APIModel):
    question_id: int
    question_order: int
    question_text: str
    options: list[str]
    selected_option: int | None
    selected_label: str | None
    correct_option: int
    correct_label: str
    explanation: str | None
    is_correct: bool


class TestAttemptReviewOut(APIModel):
    test_id: int
    attempt_id: int
    title: str
    submitted_at: datetime
    score_raw: int
    score_pct: float
    xp_earned: int
    max_xp: int
    total_questions: int
    questions: list[TestAttemptReviewQuestionOut]


class TestReopenRequestIn(APIModel):
    reason: str | None = None


class TestReopenRequestOut(APIModel):
    id: int
    test_id: int
    attempt_id: int
    requested_by: int
    status: str
    reason: str | None
    requested_at: datetime
    resolved_at: datetime | None
    resolved_by: int | None


class TestReopenResolveIn(APIModel):
    decision: str

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, value: str) -> str:
        lowered = value.strip().lower()
        if lowered not in {"approve", "reject"}:
            raise ValueError("decision must be approve or reject")
        return lowered


class TestReopenResolveOut(APIModel):
    request: TestReopenRequestOut
    assignment_status: str
    xp_delta: int
    total_xp: int
    level: int


class TestAvailabilityUpdateIn(APIModel):
    is_active: bool
