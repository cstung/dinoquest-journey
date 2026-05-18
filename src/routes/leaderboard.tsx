import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Crown, Medal, Trophy } from "lucide-react";
import { useFamilyStore } from "@/store";
import { useLeaderboard, type LeaderboardEntry } from "@/hooks/use-leaderboard";

export const Route = createFileRoute("/leaderboard")({ component: LeaderboardPage });

function LeaderboardPage() {
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const [tab, setTab] = useState<"family" | "global">("family");
  const query = useLeaderboard(familyId, tab);

  if (!familyId) {
    return <div className="py-10 text-sm text-muted-foreground">Select a family first.</div>;
  }

  if (query.isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">Loading leaderboard...</div>;
  }

  if (query.error || !query.data) {
    return <div className="py-10 text-sm text-destructive">Failed to load leaderboard.</div>;
  }

  const list = query.data.items;
  const max = Math.max(...list.map((e) => e.xp), 1);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-warning to-pink p-6 text-white shadow-pop-lg">
        <div className="flex items-center gap-3">
          <div className="size-14 rounded-2xl bg-white/20 backdrop-blur grid place-items-center">
            <Trophy className="size-7" />
          </div>
          <div>
            <h1 className="text-3xl text-white">Leaderboard</h1>
            <p className="text-white/85 font-bold">Climb the ranks. Earn glory.</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b-2 border-border">
        {(["family", "global"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-5 py-2.5 font-display font-extrabold uppercase text-sm tracking-wide border-b-4 -mb-0.5 capitalize transition-colors",
              tab === t ? "border-warning text-warning" : "border-transparent text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {list.map((e) => (
          <Row key={`${tab}-${e.rank}-${e.userId}`} entry={e} max={max} />
        ))}
      </div>
    </div>
  );
}

function Row({ entry, max }: { entry: LeaderboardEntry; max: number }) {
  const pct = (entry.xp / max) * 100;
  const isTop3 = entry.rank <= 3;
  const rankStyle: Record<number, string> = {
    1: "bg-gradient-to-br from-yellow-300 to-warning text-white",
    2: "bg-gradient-to-br from-slate-300 to-slate-400 text-white",
    3: "bg-gradient-to-br from-amber-600 to-amber-700 text-white",
  };
  return (
    <div
      className={cn(
        "rounded-2xl border-2 p-4 flex items-center gap-4 transition-all",
        entry.isYou ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border bg-card",
      )}
    >
      <div
        className={cn(
          "size-12 rounded-2xl grid place-items-center font-display font-extrabold text-lg shrink-0",
          isTop3 ? rankStyle[entry.rank] : "bg-muted text-foreground",
        )}
      >
        {entry.rank === 1 ? (
          <Crown className="size-6" />
        ) : entry.rank <= 3 ? (
          <Medal className="size-5" />
        ) : (
          entry.rank
        )}
      </div>
      <div
        className="size-12 shrink-0 rounded-2xl grid place-items-center text-base font-extrabold text-white shadow-pop-sm"
        style={{ backgroundColor: entry.avatarColor ?? "#9ca3af" }}
      >
        {entry.username.slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-display font-extrabold truncate">{entry.username}</span>
          <span className="text-[10px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded bg-warning/20 text-warning">
            LVL {entry.level}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary-dark rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="font-display font-extrabold text-lg tabular-nums shrink-0">
        {entry.xp.toLocaleString()}
      </div>
    </div>
  );
}
