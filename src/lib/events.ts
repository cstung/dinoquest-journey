// Friendly wording for activity event types, shown in feeds and notifications.
const EVENT_TEXT: Record<string, string> = {
  quest_created: "added a new quest",
  quest_updated: "updated a quest",
  quest_deleted: "removed a quest",
  quest_completion_requested: "finished a quest — waiting for a check ✋",
  quest_completion_resolved: "checked a quest",
  quest_completed: "completed a quest 🎉",
  quest_missed: "missed a quest",
  quest_cycle_created: "got a new round of a quest",
  test_published: "added a new video quiz",
  test_completed: "finished a video quiz 🎬",
  test_reopen_requested: "asked to retry a video quiz",
  test_reopen_resolved: "answered a retry request",
  reward_created: "added a new reward",
  reward_updated: "updated a reward",
  reward_deleted: "removed a reward",
  reward_claim_requested: "asked for a reward 🎁",
  reward_claim_resolved: "answered a reward request",
  level_up: "leveled up! ⭐",
  parent_reward: "got a bonus 🎁",
  wall_post_created: "posted in the Family Yard",
  member_joined: "joined the family 👋",
  member_removed: "removed a family member",
  role_changed: "changed a member's role",
  invite_sent: "created an invite",
  invite_revoked: "cancelled an invite",
  family_created: "created this family",
  family_updated: "updated family settings",
  pet_created: "hatched a new pet 🥚",
  pet_fed: "fed their pet 🍖",
  pet_updated: "updated their pet",
  wall_post_boosted: "boosted a Family Yard post 🚀",
  join_request_resolved: "answered a join request",
};

export function friendlyEventText(eventType: string): string {
  return EVENT_TEXT[eventType] ?? eventType.replaceAll("_", " ");
}
