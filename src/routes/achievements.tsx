import { createFileRoute } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { useFamilyActivity } from "@/hooks/use-families";
import { useFamilyStore } from "@/store";

export const Route = createFileRoute("/achievements")({ component: AchievementsPage });

function AchievementsPage() {
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const activity = useFamilyActivity(familyId, "activity", !!familyId);
  const achievementItems = (activity.data?.items ?? []).filter((item) => item.eventType === "achievement_earned");

  if (!familyId) {
    return <div className="py-10 text-sm text-muted-foreground">Select a family first.</div>;
  }

  if (activity.isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">Loading achievements...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Achievements</h1>
      {achievementItems.length === 0 ? (
        <div className="rounded-2xl border-2 border-border bg-card p-6 text-sm text-muted-foreground">
          No achievements recorded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {achievementItems.map((item) => {
            const payload = item.payload ?? {};
            const code = typeof payload.code === "string" ? payload.code : "Achievement";
            const tier = typeof payload.tier === "string" ? payload.tier : "Unlocked";
            return (
              <div key={item.id} className="rounded-2xl bg-card border-2 border-border p-4 flex items-center gap-3">
                <div className="size-10 rounded-xl bg-warning/15 text-warning grid place-items-center">
                  <Trophy className="size-5" />
                </div>
                <div className="flex-1">
                  <p className="font-bold">{item.username ?? "A member"}</p>
                  <p className="text-sm text-muted-foreground">
                    {code} · {tier}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
