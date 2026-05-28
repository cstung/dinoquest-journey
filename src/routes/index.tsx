import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ListChecks, Trophy, Flame, ArrowRight, Sparkles, Gift } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { XPBar } from "@/components/xp-bar";
import { useAuthStore, useFamilyStore } from "@/store";
import { useFamilyActivity, useFamilyDetail } from "@/hooks/use-families";
import { useLeaderboard, useLevelUp } from "@/hooks/use-leaderboard";
import { usePets } from "@/hooks/use-pets";
import { useQuests } from "@/hooks/use-quests";
import { useTests } from "@/hooks/use-tests";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getQuestCategoryLabel } from "@/lib/quest-categories";

export const Route = createFileRoute("/")({ component: HomePage });

function eventLabelWithXp(eventType: string, payload: Record<string, unknown> | null): string {
  if (eventType === "parent_reward" && payload) {
    const xp = Number(payload.xp ?? 0);
    const reason = typeof payload.label === "string" ? payload.label : "Parent reward";
    return `${reason} (+${xp.toLocaleString()} XP)`;
  }
  const normalized = eventType.replaceAll("_", " ");
  const xpDelta = resolveXpDelta(eventType, payload);
  if (xpDelta === null) return normalized;
  const sign = xpDelta >= 0 ? "+" : "-";
  return `${normalized} (${sign}${Math.abs(xpDelta).toLocaleString()} XP)`;
}

function resolveXpDelta(eventType: string, payload: Record<string, unknown> | null): number | null {
  if (!payload) return null;
  const asNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return null;
  };
  if (eventType === "test_completed") return asNumber(payload.xp_earned);
  if (eventType === "quest_completed") return asNumber(payload.xp);
  if (eventType === "parent_reward") return asNumber(payload.xp);
  if (eventType === "reward_claim_resolved") return asNumber(payload.xp_delta);
  if (eventType === "test_reopen_resolved") return asNumber(payload.xp_delta);
  if (eventType === "level_up") {
    const spent = asNumber(payload.xp_spent);
    return spent == null ? null : -Math.abs(spent);
  }
  return null;
}

function buildXpBalanceSeries(
  activity: Array<{
    createdAt: string;
    eventType: string;
    payload: Record<string, unknown> | null;
    userId: number | null;
  }>,
  userId: number,
  currentBalance: number,
): Array<{ label: string; balance: number; directRewardBalance: number | null }> {
  const days = 7;
  const msDay = 24 * 60 * 60 * 1000;
  const today = new Date();
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(endOfToday.getTime() - (days - 1) * msDay);
  const deltasByDay = new Array<number>(days).fill(0);
  const directRewardByDay = new Array<number>(days).fill(0);

  for (const item of activity) {
    if (item.userId !== userId) continue;
    const delta = resolveXpDelta(item.eventType, item.payload);
    if (delta == null) continue;
    const ts = new Date(item.createdAt);
    const day = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate());
    const dayIndex = Math.floor((day.getTime() - start.getTime()) / msDay);
    if (dayIndex >= 0 && dayIndex < days) {
      deltasByDay[dayIndex] += delta;
      if (item.eventType === "parent_reward") {
        directRewardByDay[dayIndex] += delta;
      }
    }
  }

  const netInWindow = deltasByDay.reduce((acc, value) => acc + value, 0);
  let runningBalance = currentBalance - netInWindow;

  return deltasByDay.map((delta, index) => {
    runningBalance += delta;
    const day = new Date(start.getTime() + index * msDay);
    return {
      label: day.toLocaleDateString(undefined, { weekday: "short" }),
      balance: Math.max(0, Math.round(runningBalance)),
      directRewardBalance:
        directRewardByDay[index] > 0 ? Math.max(0, Math.round(runningBalance)) : null,
    };
  });
}

function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const tod = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <h1 className="text-3xl sm:text-4xl">
      {tod}, {name}! 👋
    </h1>
  );
}

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className={`rounded-2xl p-4 border-2 ${color}`}>
      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide opacity-80">
        {icon}
        {label}
      </div>
      <div className="font-display text-3xl font-extrabold mt-1">{value}</div>
    </div>
  );
}

function HomePage() {
  const user = useAuthStore((s) => s.user);
  const activeFamilyId = useFamilyStore((s) => s.activeFamilyId);
  const activeFamilyRole = useFamilyStore((s) => s.activeFamilyRole);
  const familyQuery = useFamilyDetail(activeFamilyId);
  const leaderboardQuery = useLeaderboard(activeFamilyId, "family");
  const questsQuery = useQuests(activeFamilyId, { status: "pending" });
  const testsQuery = useTests(activeFamilyId, { status: "all" });
  const activityQuery = useFamilyActivity(activeFamilyId, "activity", !!activeFamilyId, 30);
  const petsQuery = usePets(activeFamilyId);
  const levelUpMutation = useLevelUp(activeFamilyId);
  const [levelUpConfirmOpen, setLevelUpConfirmOpen] = useState(false);
  const [levelUpSuccessOpen, setLevelUpSuccessOpen] = useState(false);
  const [levelUpError, setLevelUpError] = useState<string | null>(null);
  const [levelUpReachedLevel, setLevelUpReachedLevel] = useState<number | null>(null);
  const [dismissedRewardEventId, setDismissedRewardEventId] = useState<number | null>(null);

  if (!activeFamilyId || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="text-center max-w-md space-y-4">
          <div className="text-7xl">🦖</div>
          <h2 className="text-3xl">Welcome to DinoQuest!</h2>
          <p className="text-muted-foreground">
            Create a family or join an existing one to get started.
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              to="/families/new"
              className="rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase px-6 py-3 btn-pop"
            >
              Create
            </Link>
            <Link
              to="/register"
              className="rounded-2xl bg-card border-2 border-border font-display font-extrabold uppercase px-6 py-3"
            >
              Register
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const family = familyQuery.data;
  const myEntry = (leaderboardQuery.data?.items ?? []).find((entry) => entry.isYou) ?? null;
  const heroLevel = myEntry?.level ?? 1;
  const heroBalance = myEntry?.xp ?? 0;
  const heroLevelUpCost = 50 * Math.max(heroLevel, 1);
  const heroCanLevelUp = heroBalance >= heroLevelUpCost;
  const heroProgressCurrent = Math.min(heroBalance, heroLevelUpCost);
  const heroStreak = myEntry?.currentStreak ?? 0;
  const pendingQuests = questsQuery.data?.items ?? [];
  const tests = testsQuery.data?.items ?? [];
  const activity = activityQuery.data?.items ?? [];
  const pets = petsQuery.data?.items ?? [];
  const activePet = pets.find((p) => p.isActive) ?? pets[0];
  const isChildView = activeFamilyRole === "child";

  const now = new Date();
  const doneToday = activity.filter((a) => {
    const d = new Date(a.createdAt);
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate() &&
      (a.eventType.includes("completed") || a.eventType.includes("resolved"))
    );
  }).length;

  const xpBalanceSeries = buildXpBalanceSeries(activity, user.id, heroBalance);
  const latestParentReward = (() => {
    if (!isChildView) return null;
    return (
      activity
        .filter((row) => row.eventType === "parent_reward" && row.userId === user.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ??
      null
    );
  })();

  const rewardXp = Number(latestParentReward?.payload?.xp ?? 0);
  const rewardReason =
    typeof latestParentReward?.payload?.label === "string"
      ? latestParentReward.payload.label
      : "Parent reward";
  const persistedDismissedRewardId = (() => {
    if (!activeFamilyId || typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(
      `dq:dismissed-parent-reward:${activeFamilyId}:${user.id}`,
    );
    const parsed = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
  })();
  const effectiveDismissedRewardId = dismissedRewardEventId ?? persistedDismissedRewardId;
  const showGiftBanner =
    !!latestParentReward && isChildView && latestParentReward.id !== effectiveDismissedRewardId;
  const chartDomain = (() => {
    if (xpBalanceSeries.length === 0) return [0, Math.max(heroBalance, 10)] as const;
    const values = xpBalanceSeries.map((point) => point.balance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad =
      min === max
        ? Math.max(10, Math.round(max * 0.12))
        : Math.max(6, Math.round((max - min) * 0.2));
    return [Math.max(0, min - pad), max + pad] as const;
  })();

  return (
    <>
      <div className="space-y-6">
        {showGiftBanner && latestParentReward && (
          <div className="rounded-2xl border-2 border-purple/30 bg-purple/10 p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-xl bg-purple text-white grid place-items-center shrink-0">
                <Gift className="size-5" />
              </div>
              <div>
                <p className="font-display font-extrabold text-sm uppercase tracking-wide text-purple">
                  You received a gift!
                </p>
                <p className="text-sm font-bold mt-1">
                  +{rewardXp.toLocaleString()} XP
                </p>
                <p className="text-xs text-muted-foreground mt-1">{rewardReason}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDismissedRewardEventId(latestParentReward.id);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(
                    `dq:dismissed-parent-reward:${activeFamilyId}:${user.id}`,
                    String(latestParentReward.id),
                  );
                }
              }}
              className="text-xs font-extrabold uppercase text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="rounded-3xl bg-gradient-to-br from-primary to-primary-dark text-primary-foreground p-6 sm:p-8 shadow-pop-lg">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <Greeting name={user.username} />
              <div className="mt-2 inline-flex items-center gap-2 bg-white/15 backdrop-blur rounded-full px-3 py-1 text-sm font-bold">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: family?.colorHex ?? "#999" }}
                />
                {family?.name ?? "Loading family..."}
              </div>
            </div>
            <div className="flex items-center gap-2 bg-warning rounded-2xl px-4 py-2 shadow-pop-sm">
              <Flame className="size-5" />
              <span className="font-display font-extrabold text-xl">{heroStreak}</span>
              <span className="font-bold text-sm uppercase">day streak</span>
            </div>
          </div>
          <div className="mt-6 bg-white/15 backdrop-blur rounded-2xl p-4">
            <XPBar currentXP={heroProgressCurrent} maxXP={heroLevelUpCost} level={heroLevel} />
            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-bold text-primary-foreground/90">
                Balance: {heroBalance.toLocaleString()} XP · Level up cost:{" "}
                {heroLevelUpCost.toLocaleString()} XP
              </p>
              <button
                type="button"
                onClick={() => {
                  setLevelUpError(null);
                  setLevelUpConfirmOpen(true);
                }}
                disabled={!heroCanLevelUp || levelUpMutation.isPending}
                className="rounded-xl bg-warning text-warning-foreground font-display font-extrabold uppercase text-xs px-4 py-2 shadow-pop-sm disabled:opacity-60"
              >
                {levelUpMutation.isPending ? "Leveling..." : "Level Up"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            icon={<ListChecks className="size-4" />}
            label="Pending quests"
            value={pendingQuests.length}
            color="bg-info/10 border-info/20 text-info"
          />
          <Stat
            icon={<Sparkles className="size-4" />}
            label="Done today"
            value={doneToday}
            color="bg-primary/10 border-primary/20 text-primary-dark"
          />
          <Stat
            icon={<Trophy className="size-4" />}
            label="Published video quizzes"
            value={tests.filter((t) => t.status === "published").length}
            color="bg-warning/10 border-warning/20 text-warning"
          />
          <Stat
            icon={<Flame className="size-4" />}
            label="Members"
            value={family?.memberCount ?? 0}
            color="bg-purple/10 border-purple/20 text-purple"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl">Up next</h2>
              <Link
                to="/quests"
                className="text-sm font-bold text-primary inline-flex items-center gap-1 hover:underline"
              >
                View all <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {pendingQuests.slice(0, 3).map((q) => (
                <Link
                  key={q.id}
                  to="/quests/$questId"
                  params={{ questId: String(q.id) }}
                  className="rounded-2xl bg-card border-2 border-border p-4 card-pop hover:border-primary/40 transition-colors block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold uppercase tracking-wide px-2 py-1 rounded-md bg-primary/15 text-primary-dark">
                      {getQuestCategoryLabel(q.category)}
                    </span>
                    <span className="text-xs font-extrabold text-warning">+{q.xpReward} XP</span>
                  </div>
                  <h3 className="font-display font-extrabold text-base leading-tight">{q.title}</h3>
                  {q.dueDate && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Due {new Date(q.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </Link>
              ))}
            </div>

            <div className="rounded-2xl bg-card border-2 border-border p-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold uppercase tracking-wide px-2 py-1 rounded-md bg-warning/15 text-warning">
                  XP Balance
                </span>
                <span className="text-xs font-extrabold text-primary-dark">Last 7 days</span>
              </div>
              <h3 className="font-display font-extrabold text-base leading-tight">
                Ending Balance Trend
              </h3>
              <p className="text-xs text-muted-foreground mt-2 mb-2">
                Today: {heroBalance.toLocaleString()} XP
              </p>
              <div className="mb-2 flex items-center gap-4 text-[11px] font-bold">
                <span className="inline-flex items-center gap-1.5 text-primary-dark">
                  <span className="size-2 rounded-full bg-[#0EA5E9]" />
                  Total XP balance
                </span>
                <span className="inline-flex items-center gap-1.5 text-purple">
                  <span className="size-2 rounded-full bg-purple" />
                  Direct reward
                </span>
              </div>
              <div className="h-44 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={xpBalanceSeries}
                    margin={{ top: 10, right: 10, bottom: 0, left: -20 }}
                  >
                    <CartesianGrid strokeDasharray="4 4" stroke="#D7DEE6" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "#6B7280", fontWeight: 700 }}
                    />
                    <YAxis hide domain={chartDomain as [number, number]} />
                    <Tooltip
                      formatter={(value) => [`${Number(value).toLocaleString()} XP`, "Balance"]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "2px solid #D7DEE6",
                        background: "#FFFFFF",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    />
                    <ReferenceLine
                      y={heroBalance}
                      stroke="#F59E0B"
                      strokeDasharray="4 4"
                      ifOverflow="extendDomain"
                    />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      stroke="#0EA5E9"
                      strokeWidth={3.5}
                      dot={{ r: 3.5, fill: "#0EA5E9", strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: "#0284C7" }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="directRewardBalance"
                      stroke="transparent"
                      strokeWidth={1}
                      dot={{
                        r: 4.5,
                        fill: "oklch(0.62 0.23 300)",
                        stroke: "#fff",
                        strokeWidth: 1.5,
                      }}
                      activeDot={{ r: 6, fill: "oklch(0.62 0.23 300)" }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl bg-card border-2 border-border p-4 mt-4">
              <h3 className="font-display font-extrabold mb-3">Recent activity</h3>
              {activityQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading activity...</p>
              ) : activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="space-y-3">
                  {activity.slice(0, 5).map((a) => (
                    <li key={a.id} className="flex items-center gap-3 text-sm">
                      {a.eventType === "parent_reward" ? (
                        <span className="size-8 rounded-xl grid place-items-center text-white shrink-0 bg-purple">
                          <Gift className="size-4" />
                        </span>
                      ) : (
                        <span className="size-8 rounded-xl grid place-items-center text-xs font-extrabold text-white shrink-0 bg-primary/80">
                          {(a.username ?? "S").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-bold">{a.username ?? "System"}</span>{" "}
                        <span className="text-muted-foreground">
                          {eventLabelWithXp(a.eventType, a.payload ?? null)}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(a.createdAt).toLocaleTimeString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-gradient-to-br from-info/15 to-purple/15 border-2 border-info/20 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-extrabold">Your dino</h3>
              <Link to="/pets" className="text-xs font-bold text-info hover:underline">
                View →
              </Link>
            </div>
            {petsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading pets...</p>
            ) : !activePet ? (
              <p className="text-sm text-muted-foreground">No pet yet. Create one in Pets.</p>
            ) : (
              <>
                <div className="text-center py-4">
                  <div className="text-8xl animate-bounce-soft inline-block">🦖</div>
                  <h4 className="font-display font-extrabold text-2xl mt-2">{activePet.name}</h4>
                  <p className="text-sm text-muted-foreground capitalize">
                    {activePet.species} · {activePet.stage}
                  </p>
                </div>
                <div className="bg-card rounded-2xl p-3">
                  <XPBar
                    currentXP={activePet.xp}
                    maxXP={activePet.xpToNext}
                    level={activePet.level}
                    size="sm"
                    showNumbers={false}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Last fed:{" "}
                    {activePet.lastFedAt ? new Date(activePet.lastFedAt).toLocaleString() : "Never"}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <Dialog open={levelUpConfirmOpen} onOpenChange={setLevelUpConfirmOpen}>
        <DialogContent className="max-w-sm rounded-3xl border-2 border-border bg-card p-6 shadow-pop-lg">
          <DialogHeader className="space-y-2">
            <DialogTitle className="font-display text-2xl font-extrabold">
              Level Up to Level {heroLevel + 1}?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              This will cost {heroLevelUpCost.toLocaleString()} XP. Balance:{" "}
              {heroBalance.toLocaleString()} XP. After level up:{" "}
              {Math.max(heroBalance - heroLevelUpCost, 0).toLocaleString()} XP.
            </DialogDescription>
            {levelUpError && <p className="text-sm text-destructive">{levelUpError}</p>}
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setLevelUpConfirmOpen(false)}
              className="rounded-xl border-2 border-border bg-background px-4 py-2 text-xs font-extrabold uppercase"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                setLevelUpError(null);
                try {
                  const result = await levelUpMutation.mutateAsync();
                  setLevelUpReachedLevel(result.newLevel);
                  setLevelUpConfirmOpen(false);
                  setLevelUpSuccessOpen(true);
                } catch (err) {
                  setLevelUpError((err as Error).message);
                }
              }}
              disabled={!heroCanLevelUp || levelUpMutation.isPending}
              className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-extrabold uppercase disabled:opacity-60"
            >
              {levelUpMutation.isPending ? "Processing..." : "Confirm Level Up"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={levelUpSuccessOpen} onOpenChange={setLevelUpSuccessOpen}>
        <DialogContent className="max-w-sm rounded-3xl border-2 border-border bg-card p-6 shadow-pop-lg">
          <DialogHeader className="space-y-2">
            <DialogTitle className="font-display text-2xl font-extrabold">
              You reached Level {levelUpReachedLevel ?? heroLevel}!
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Great work. Keep going for the next level.
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => setLevelUpSuccessOpen(false)}
            className="mt-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-extrabold uppercase"
          >
            Close
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
