import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { tests, children } from "@/data/mock";
import { useFamilyStore } from "@/store";
import { Plus, Clock, AlertCircle, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tests/")({ component: TestsPage });

function TestsPage() {
  const isParent = useFamilyStore((s) => s.activeFamilyRole) === "parent";
  const [tab, setTab] = useState<"all" | "draft" | "published" | "completed">("all");
  const reopenCount = tests.filter((t) => t.status === "reopen_requested").length;

  const filtered = tests.filter((t) => {
    if (tab === "all") return true;
    if (tab === "published") return t.status === "published" || t.status === "reopen_requested";
    return t.status === tab;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl">{isParent ? "Tests" : "My Tests"}</h1>
        {isParent && (
          <Link to="/tests/new" className="rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase px-5 py-3 shadow-pop-sm inline-flex items-center gap-2">
            <Plus className="size-5" strokeWidth={3} /> New Test
          </Link>
        )}
      </div>

      {reopenCount > 0 && isParent && (
        <div className="rounded-2xl bg-warning/15 border-2 border-warning/30 p-4 flex items-center gap-3">
          <AlertCircle className="size-5 text-warning shrink-0" />
          <p className="text-sm font-bold">
            <span className="text-warning">{reopenCount} reopen request{reopenCount > 1 ? "s" : ""}</span> waiting for your approval.
          </p>
        </div>
      )}

      <div className="flex gap-2 border-b-2 border-border overflow-x-auto">
        {(isParent ? ["all", "draft", "published", "completed"] : ["all", "completed"]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as typeof tab)}
            className={cn(
              "px-4 py-2.5 font-display font-extrabold uppercase text-sm tracking-wide border-b-4 -mb-0.5 whitespace-nowrap transition-colors",
              tab === t ? "border-info text-info" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {filtered.map((t) => (
          <div key={t.id} className="rounded-2xl bg-card border-2 border-border p-4 card-pop flex flex-col sm:flex-row gap-4">
            <div className="relative aspect-video sm:w-64 shrink-0 rounded-xl overflow-hidden bg-muted">
              <img src={t.thumbnailUrl} alt={t.title} className="absolute inset-0 size-full object-cover" />
              <div className="absolute inset-0 bg-black/30 grid place-items-center opacity-0 hover:opacity-100 transition-opacity">
                <div className="size-12 rounded-full bg-info text-info-foreground grid place-items-center">
                  <Play className="size-6 ml-0.5" fill="currentColor" />
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <StatusBadge status={t.status} />
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Subtitles: {t.subtitleSource === "youtube_auto" ? "YouTube" : "Whisper AI"}
                  </span>
                </div>
                <h3 className="font-display font-extrabold text-lg leading-tight">{t.title}</h3>
                <p className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
                  <span>{t.questionCount} questions</span>
                  <span className="size-1 rounded-full bg-muted-foreground" />
                  <span className="flex items-center gap-1"><Clock className="size-3" /> {t.timeLimit} min</span>
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex -space-x-2">
                  {t.assignedTo.map((id) => {
                    const c = children.find((c) => c.id === id);
                    return (
                      <span
                        key={id}
                        className="size-7 rounded-xl border-2 border-card grid place-items-center text-[10px] font-extrabold text-white"
                        style={{ backgroundColor: c?.avatarColor }}
                      >
                        {c?.name.slice(0, 1)}
                      </span>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-extrabold text-warning">+{t.xp} XP</span>
                  {isParent ? (
                    <button className="rounded-xl bg-info text-info-foreground font-display font-extrabold uppercase text-xs px-3 py-2">View Report</button>
                  ) : (
                    <Link to="/tests" className="rounded-xl bg-primary text-primary-foreground font-display font-extrabold uppercase text-xs px-3 py-2 btn-pop">Start Test</Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    published: "bg-info/15 text-info",
    completed: "bg-primary/15 text-primary-dark",
    reopen_requested: "bg-warning/15 text-warning",
  };
  const label: Record<string, string> = {
    draft: "Draft",
    published: "Published",
    completed: "Done",
    reopen_requested: "⚠ Reopen Requested",
  };
  return (
    <span className={cn("text-[10px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-md", map[status])}>
      {label[status]}
    </span>
  );
}
