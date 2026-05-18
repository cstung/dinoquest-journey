import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { quests, children } from "@/data/mock";
import { ArrowLeft, Calendar, Award, Zap, Repeat, User } from "lucide-react";

export const Route = createFileRoute("/quests/$questId")({ component: QuestDetail });

function QuestDetail() {
  const { questId } = useParams({ from: "/quests/$questId" });
  const quest = quests.find((q) => q.id === Number(questId));

  if (!quest) {
    return (
      <div className="text-center py-16">
        <p>Quest not found.</p>
        <Link to="/quests" className="text-primary font-bold">Back</Link>
      </div>
    );
  }

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
                <div className="font-display font-extrabold text-xl">+{quest.xp} XP</div>
              </div>
            </div>
            {quest.dueDate && (
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-info/15 grid place-items-center text-info">
                  <Calendar className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-muted-foreground uppercase">Due</div>
                  <div className="font-bold">{quest.dueDate}</div>
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
            {quest.recurring && (
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-pink/15 grid place-items-center text-pink">
                  <Repeat className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-muted-foreground uppercase">Recurrence</div>
                  <div className="font-bold">Daily</div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card border-2 border-border p-5">
            <h3 className="font-display font-extrabold mb-3 flex items-center gap-2"><User className="size-4" />Assigned to</h3>
            <ul className="space-y-2">
              {quest.assignedTo.map((id) => {
                const c = children.find((c) => c.id === id);
                return (
                  <li key={id} className="flex items-center gap-3">
                    <span
                      className="size-8 rounded-xl grid place-items-center text-xs font-extrabold text-white"
                      style={{ backgroundColor: c?.avatarColor }}
                    >
                      {c?.name.slice(0, 1)}
                    </span>
                    <span className="flex-1 font-bold text-sm">{c?.name}</span>
                    <span className="text-xs font-bold text-muted-foreground">Pending</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <button className="w-full rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-4 btn-pop">
            Mark as Complete
          </button>
        </aside>
      </div>
    </div>
  );
}
