from __future__ import annotations

import re

from backend.schemas.video_test import TestQuestionDraft


def _sentences(transcript: str) -> list[str]:
    items = [s.strip() for s in re.split(r"[.!?]\s+", transcript) if s.strip()]
    if items:
        return items
    return ["This video shares a key lesson and practical examples."]


def _option_variants(base: str) -> list[str]:
    concise = base[:180].rstrip(".")
    return [
        concise,
        f"{concise} but without examples.",
        f"{concise} with unrelated details.",
        f"A different idea than: {concise[:90]}",
    ]


def generate_quiz_questions(
    *,
    transcript: str,
    title: str,
    question_count: int,
) -> list[TestQuestionDraft]:
    source = _sentences(transcript)
    questions: list[TestQuestionDraft] = []

    for idx in range(question_count):
        sentence = source[idx % len(source)]
        options = _option_variants(sentence)
        questions.append(
            TestQuestionDraft(
                question_text=f"[{title}] Which option best matches this point: \"{sentence[:120]}\"?",
                options=options,
                correct_option=0,
                explanation="The first option preserves the original meaning from the transcript.",
            )
        )

    return questions
