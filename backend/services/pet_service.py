from __future__ import annotations


def pet_level_from_xp(total_xp: int) -> int:
    level = 1
    remaining = max(total_xp, 0)
    threshold = 100
    while remaining >= threshold:
        remaining -= threshold
        level += 1
        threshold = 100 + (level - 1) * 25
    return level


def pet_stage_from_level(level: int) -> str:
    if level >= 10:
        return "evolved"
    if level >= 6:
        return "adult"
    if level >= 3:
        return "hatchling"
    return "egg"


def pet_xp_to_next_level(total_xp: int) -> int:
    level = 1
    remaining = max(total_xp, 0)
    threshold = 100
    while remaining >= threshold:
        remaining -= threshold
        level += 1
        threshold = 100 + (level - 1) * 25
    return threshold - remaining
