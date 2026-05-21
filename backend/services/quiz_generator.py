from __future__ import annotations

import asyncio
import hashlib
import json
import re

from backend.config import get_settings
from backend.schemas.video_test import TestQuestionDraft

try:
    from openai import OpenAI  # type: ignore
except Exception:  # pragma: no cover - optional dependency fallback
    OpenAI = None  # type: ignore


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


def _fallback_questions(*, transcript: str, title: str, question_count: int) -> list[TestQuestionDraft]:
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


def _difficulty_instructions(difficulty: str) -> str:
    level = (difficulty or "medium").strip().lower()
    if level == "easy":
        return (
            "Difficulty: EASY.\n"
            "- Use very short, simple sentences and obvious answer differences.\n"
            "- Questions should focus on direct facts from the transcript.\n"
            "- Avoid tricky distractors."
        )
    if level == "hard":
        return (
            "Difficulty: HARD (tricky).\n"
            "- Use deeper comprehension and inference questions.\n"
            "- Include plausible, tricky distractors that are close to correct meaning.\n"
            "- Keep child-safe language but increase cognitive challenge."
        )
    return (
        "Difficulty: MEDIUM.\n"
        "- Mix direct recall and simple comprehension.\n"
        "- Distractors should be reasonable but not overly tricky."
    )


def _fallback_single_question(
    *,
    transcript: str,
    title: str,
    existing_questions: list[str] | None = None,
    target_question_text: str | None = None,
) -> TestQuestionDraft:
    source = _sentences(transcript)
    existing_questions = existing_questions or []
    salt = target_question_text or ("|".join(existing_questions) if existing_questions else title)
    idx = int(hashlib.sha1(salt.encode("utf-8")).hexdigest(), 16) % max(len(source), 1)
    sentence = source[idx]
    options = _option_variants(sentence)
    return TestQuestionDraft(
        question_text=f"[{title}] Which option best matches this point: \"{sentence[:120]}\"?",
        options=options,
        correct_option=0,
        explanation="The first option preserves the original meaning from the transcript.",
    )


def _normalize_llm_question(item: dict) -> TestQuestionDraft:
    options = item.get("options") or []
    if not isinstance(options, list):
        options = []
    normalized_options = [str(opt).strip() for opt in options[:4]]
    while len(normalized_options) < 4:
        normalized_options.append(f"Option {len(normalized_options) + 1}")

    correct_option = item.get("correctOption", 0)
    try:
        correct_option_idx = int(correct_option)
    except Exception:
        correct_option_idx = 0
    correct_option_idx = max(0, min(3, correct_option_idx))

    return TestQuestionDraft(
        question_text=str(item.get("questionText", "")).strip() or "Which statement is correct?",
        options=normalized_options,  # validated by schema
        correct_option=correct_option_idx,
        explanation=str(item.get("explanation", "")).strip() or None,
    )


def _generate_with_openai_sync(
    *,
    transcript: str,
    title: str,
    question_count: int,
    difficulty: str,
) -> list[TestQuestionDraft]:
    settings = get_settings()
    if OpenAI is None or not settings.openai_api_key.strip():
        raise RuntimeError("OpenAI SDK/key unavailable")

    client = OpenAI(api_key=settings.openai_api_key)
    prompt = (
        "Create age-appropriate (ages 6-12) multiple-choice quiz questions from the transcript.\n"
        f"Title: {title}\n"
        f"Question count: {question_count}\n\n"
        f"{_difficulty_instructions(difficulty)}\n\n"
        "Return ONLY JSON with this exact shape:\n"
        '{ "questions": [ { "questionText": string, "options": [string,string,string,string], "correctOption": 0-3, "explanation": string } ] }\n'
        "Rules:\n"
        "- Use simple English for children.\n"
        "- Exactly 4 options each.\n"
        "- Exactly one correct option.\n"
        "- Keep explanations short and educational.\n\n"
        f"Transcript:\n{transcript}"
    )

    resp = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": "You generate child-friendly quiz questions from transcripts."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=4000,
    )
    text = (resp.choices[0].message.content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE | re.DOTALL).strip()
    if not text:
        raise RuntimeError("OpenAI returned empty response")
    parsed = json.loads(text)
    rows = parsed.get("questions")
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("OpenAI response missing questions")

    questions = [_normalize_llm_question(item) for item in rows[:question_count] if isinstance(item, dict)]
    if len(questions) < question_count:
        raise RuntimeError("OpenAI returned insufficient questions")
    return questions[:question_count]


def _generate_single_with_openai_sync(
    *,
    transcript: str,
    title: str,
    existing_questions: list[str] | None = None,
    target_question_text: str | None = None,
    difficulty: str,
) -> TestQuestionDraft:
    settings = get_settings()
    if OpenAI is None or not settings.openai_api_key.strip():
        raise RuntimeError("OpenAI SDK/key unavailable")

    existing_block = "\n".join(f"- {q}" for q in (existing_questions or []) if q.strip()) or "- none"
    target_block = target_question_text.strip() if target_question_text else "(not provided)"
    client = OpenAI(api_key=settings.openai_api_key)
    prompt = (
        "Generate ONE age-appropriate (ages 6-12) multiple-choice question from the transcript.\n"
        f"Title: {title}\n"
        f"{_difficulty_instructions(difficulty)}\n"
        f"Question to replace (if any): {target_block}\n"
        "Avoid duplicating these existing questions:\n"
        f"{existing_block}\n\n"
        "Return ONLY JSON with this shape:\n"
        '{ "question": { "questionText": string, "options": [string,string,string,string], "correctOption": 0-3, "explanation": string } }\n'
        "Rules:\n"
        "- Use simple English for children.\n"
        "- Exactly 4 options.\n"
        "- Exactly one correct option.\n"
        "- Keep explanation short and educational.\n\n"
        f"Transcript:\n{transcript}"
    )

    resp = client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": "You generate one child-friendly quiz question from transcripts."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.45,
        max_tokens=1200,
    )
    text = (resp.choices[0].message.content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE | re.DOTALL).strip()
    if not text:
        raise RuntimeError("OpenAI returned empty response")
    parsed = json.loads(text)
    question = parsed.get("question")
    if not isinstance(question, dict):
        raise RuntimeError("OpenAI response missing question")
    return _normalize_llm_question(question)


async def generate_quiz_questions(
    *,
    transcript: str,
    title: str,
    question_count: int,
    difficulty: str = "medium",
) -> list[TestQuestionDraft]:
    try:
        return await asyncio.to_thread(
            _generate_with_openai_sync,
            transcript=transcript,
            title=title,
            question_count=question_count,
            difficulty=difficulty,
        )
    except Exception:
        return _fallback_questions(
            transcript=transcript,
            title=title,
            question_count=question_count,
        )


async def generate_single_quiz_question(
    *,
    transcript: str,
    title: str,
    existing_questions: list[str] | None = None,
    target_question_text: str | None = None,
    difficulty: str = "medium",
) -> TestQuestionDraft:
    try:
        return await asyncio.to_thread(
            _generate_single_with_openai_sync,
            transcript=transcript,
            title=title,
            existing_questions=existing_questions,
            target_question_text=target_question_text,
            difficulty=difficulty,
        )
    except Exception:
        return _fallback_single_question(
            transcript=transcript,
            title=title,
            existing_questions=existing_questions,
            target_question_text=target_question_text,
        )
