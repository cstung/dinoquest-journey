import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useFamilyStore } from "@/store";
import { useCompleteQuest, useQuestDetail } from "@/hooks/use-quests";
import { ArrowLeft, Calendar, Award, Zap, Repeat, User } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/quests/$questId")({ component: QuestDetail });

function QuestDetail() {
  const { questId } = useParams({ from: "/quests/$questId" });
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const questIdNum = Number(questId);
  const query = useQuestDetail(familyId, questIdNum);
  const completeMutation = useCompleteQuest(familyId, questIdNum);
  const [completeMessage, setCompleteMessage] = useState<string | null>(null);

  if (!familyId) {
    return <div className="py-10 text-sm text-muted-foreground">Select a family first.</div>;
  }

  if (query.isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">Loading quest...</div>;
  }

  if (query.error || !query.data) {
    return (
      <div className="text-center py-16">
        <p>Quest not found.</p>
        <Link to="/quests" className="text-primary font-bold">
          Back
        </Link>
      </div>
    );
  }

  const quest = query.data;
  const canComplete = role === "child" && quest.status !== "completed";

  const onComplete = async () => {
    setCompleteMessage(null);
    try {
      const result = await completeMutation.mutateAsync();
      setCompleteMessage(`Completed! +${result.xpAwarded} XP (Level ${result.level})`);
      await query.refetch();
    } catch (err) {
      setCompleteMessage((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/quests" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to Quests
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <span className="inline-block text-xs font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-md bg-primary/15 text-primary-dark">
            {quest.category}
          </span>
          <h1 className="text-4xl">{quest.title}</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">{quest.description}</p>

          <div className="aspect-video rounded-3xl bg-gradient-to-br from-primary-light to-info/30 grid place-items-center text-8xl">
            🎯
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-card border-2 border-border p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-warning/15 grid place-items-center text-warning">
                <Zap className="size-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase">XP Reward</div>
                <div className="font-display font-extrabold text-xl">+{quest.xpReward} XP</div>
              </div>
            </div>
            {quest.dueDate && (
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-info/15 grid place-items-center text-info">
                  <Calendar className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-muted-foreground uppercase">Due</div>
                  <div className="font-bold">{new Date(quest.dueDate).toLocaleDateString()}</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-purple/15 grid place-items-center text-purple">
                <Award className="size-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase">Difficulty</div>
                <div className="font-bold">{quest.difficulty}</div>
              </div>
            </div>
            {quest.isRecurring && (
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-pink/15 grid place-items-center text-pink">
                  <Repeat className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-muted-foreground uppercase">Recurrence</div>
                  <div className="font-bold">Recurring</div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card border-2 border-border p-5">
            <h3 className="font-display font-extrabold mb-3 flex items-center gap-2">
              <User className="size-4" />
              Assigned to
            </h3>
            <ul className="space-y-2">
              {quest.assignedMembers.map((m) => (
                <li key={m.userId} className="flex items-center gap-3">
                  <span
                    className="size-8 rounded-xl grid place-items-center text-xs font-extrabold text-white"
                    style={{ backgroundColor: m.avatarColor ?? "#9ca3af" }}
                  >
                    {m.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1 font-bold text-sm">{m.username}</span>
                  <span className="text-xs font-bold text-muted-foreground capitalize">{m.status}</span>
                </li>
              ))}
            </ul>
          </div>

          {canComplete ? (
            <button
              onClick={onComplete}
              disabled={completeMutation.isPending}
              className="w-full rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-4 btn-pop disabled:opacity-60"
            >
              {completeMutation.isPending ? "Completing..." : "Mark as Complete"}
            </button>
          ) : (
            <div className="w-full rounded-2xl bg-secondary font-display font-extrabold uppercase py-4 text-center">
              {quest.status === "completed" ? "Completed" : "Parent View"}
            </div>
          )}
          {completeMessage && <p className="text-sm text-muted-foreground">{completeMessage}</p>}
        </aside>
      </div>
    </div>
  );
}

