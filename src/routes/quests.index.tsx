import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { quests, children, type Quest } from "@/data/mock";
import { useFamilyStore } from "@/store";
import { Plus, Search, Repeat, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/quests/")({ component: QuestsPage });

const CATEGORY_COLORS: Record<Quest["category"], string> = {
  Daily: "bg-info/15 text-info",
  Learning: "bg-primary/15 text-primary-dark",
  Creative: "bg-purple/15 text-purple",
  Epic: "bg-warning/15 text-warning",
};

function QuestsPage() {
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const isParent = role === "parent";
  const [tab, setTab] = useState<"all" | "pending" | "completed">("all");
  const [search, setSearch] = useState("");

  const filtered = quests.filter((q) => {
    if (tab !== "all" && q.status !== tab) return false;
    if (search && !q.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl">Quests</h1>
        {isParent && (
          <Link to="/quests/new" className="rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase px-5 py-3 btn-pop inline-flex items-center gap-2">
            <Plus className="size-5" strokeWidth={3} /> New Quest
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quests..."
            className="w-full rounded-2xl border-2 border-border bg-card pl-10 pr-4 py-2.5 font-bold text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="flex gap-2 border-b-2 border-border">
        {(["all", "pending", "completed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2.5 font-display font-extrabold uppercase text-sm tracking-wide border-b-4 -mb-0.5 transition-colors",
              tab === t ? "border-primary text-primary-dark" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((q) => (
          <Link
            key={q.id}
            to="/quests/$questId"
            params={{ questId: String(q.id) }}
            className="group rounded-2xl bg-card border-2 border-border p-5 card-pop hover:border-primary/40 transition-all hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className={cn("text-xs font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-md", CATEGORY_COLORS[q.category])}>
                {q.category}
              </span>
              <div className="flex items-center gap-1">
                {q.recurring && <Repeat className="size-3.5 text-muted-foreground" />}
                {q.status === "completed" && <CheckCircle2 className="size-4 text-primary" />}
              </div>
            </div>
            <h3 className="font-display font-extrabold text-lg leading-tight mb-2">{q.title}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2">{q.description}</p>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <div className="flex -space-x-2">
                {q.assignedTo.map((id) => {
                  const c = children.find((c) => c.id === id);
                  return (
                    <span
                      key={id}
                      className="size-7 rounded-xl border-2 border-card grid place-items-center text-[10px] font-extrabold text-white"
                      style={{ backgroundColor: c?.avatarColor }}
                      title={c?.name}
                    >
                      {c?.name.slice(0, 1)}
                    </span>
                  );
                })}
              </div>
              <span className="text-sm font-extrabold text-warning">+{q.xp} XP</span>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-3">🎯</div>
          <p className="font-bold">No quests here yet.</p>
        </div>
      )}
    </div>
  );
}
