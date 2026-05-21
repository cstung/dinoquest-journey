export const QUEST_CATEGORY_OPTIONS = [
  "learning",
  "chore",
  "habit",
  "fitness",
  "creative",
  "social",
  "custom",
] as const;

export const QUEST_CATEGORY_LABELS: Record<string, string> = {
  learning: "Learning",
  chore: "Chore",
  habit: "Habit",
  fitness: "Fitness",
  creative: "Creative",
  social: "Social",
  custom: "Custom",
};

export function getQuestCategoryLabel(value: string): string {
  const key = value.trim().toLowerCase();
  return QUEST_CATEGORY_LABELS[key] ?? value;
}

export function getQuestCategoryOptionsWithFallback(currentValue: string): string[] {
  const trimmed = currentValue.trim();
  const normalized = trimmed.toLowerCase();
  if (!trimmed) {
    return [...QUEST_CATEGORY_OPTIONS];
  }
  if (QUEST_CATEGORY_OPTIONS.includes(normalized as (typeof QUEST_CATEGORY_OPTIONS)[number])) {
    return [...QUEST_CATEGORY_OPTIONS];
  }
  return [trimmed, ...QUEST_CATEGORY_OPTIONS];
}
