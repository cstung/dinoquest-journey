import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow, format, differenceInYears } from "date-fns";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Camera,
  Pencil,
  Cake,
  Ruler,
  Weight,
  GraduationCap,
  CalendarCheck2,
  Trophy,
  Flame,
  Target,
  CheckCircle2,
  Lock,
  Sparkles,
  ListChecks,
  Video,
  Star,
  TrendingUp,
  Save,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore, useFamilyStore } from "@/store";
import { ApiError, apiRequest } from "@/lib/api";

export const Route = createFileRoute("/profile/$userId")({
  head: () => ({
    meta: [
      { title: "Profile — DinoQuest" },
      { name: "description", content: "Your dino-powered learning profile." },
    ],
  }),
  component: KidProfilePage,
});

// ---------- Profile data types ----------

const FAV_SUBJECTS = ["Math", "Science", "Reading", "Art", "Music", "PE", "Other"] as const;
const GENDERS = ["Boy", "Girl", "Prefer not to say"] as const;
const GRADES = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);

type Tier = "bronze" | "silver" | "gold" | "platinum";
interface Achievement {
  id: number;
  name: string;
  description: string;
  tier: Tier;
  icon: string;
  earned_at?: string;
}
interface ProfileData {
  id: number;
  username: string;
  nickname: string;
  avatar_url: string | null;
  birthday: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  gender: (typeof GENDERS)[number] | null;
  school_grade: string | null;
  favorite_dino: string;
  catchphrase: string;
  favorite_subject: (typeof FAV_SUBJECTS)[number];
  fun_fact: string;
  joined_at: string;
}
interface Stats {
  level: number;
  xp_balance: number;
  coin_balance: number;
  level_up_cost: number;
  total_quests_completed: number;
  total_quests_pending: number;
  total_tests_completed: number;
  current_streak_days: number;
  best_streak_days: number;
  best_test_score_pct: number | null;
  avg_test_score_pct: number;
  perfect_scores_count: number;
  favorite_quest_category: string;
  quests_last_7_days: number[];
  test_score_history: number[];
}
interface ActivityEv {
  id: number;
  event_type:
    | "quest_completed"
    | "quest_cycle_created"
    | "quest_missed"
    | "test_completed"
    | "level_up"
    | "achievement_earned"
    | "reward_claim_requested"
    | "streak_milestone"
    | "xp_earned"
    | "parent_reward";
  created_at: string;
  payload: Record<string, any>;
}

interface ActivityApiItem {
  id: number;
  eventType: string;
  createdAt: string;
  payload: Record<string, any> | null;
  userId: number | null;
}

interface ActivityApiPage {
  items: ActivityApiItem[];
}

interface LeaderboardEntry {
  userId: number;
  level: number;
  xp: number;
  coins?: number;
}

interface LeaderboardPage {
  items: LeaderboardEntry[];
}

interface QuestAssignedMember {
  userId: number;
  status: string;
  completedAt: string | null;
}

interface QuestItem {
  assignedMembers: QuestAssignedMember[];
}

interface QuestPage {
  items: QuestItem[];
}

interface TestItem {
  assignedMembers: QuestAssignedMember[];
}

interface TestPage {
  items: TestItem[];
}

const EMPTY_STATS: Stats = {
  level: 0,
  xp_balance: 0,
  coin_balance: 0,
  level_up_cost: 50,
  total_quests_completed: 0,
  total_quests_pending: 0,
  total_tests_completed: 0,
  current_streak_days: 0,
  best_streak_days: 0,
  best_test_score_pct: null,
  avg_test_score_pct: 0,
  perfect_scores_count: 0,
  favorite_quest_category: "-",
  quests_last_7_days: [0, 0, 0, 0, 0, 0, 0],
  test_score_history: [],
};

// ---------- Helpers ----------

function rankFromLevel(level: number): string {
  if (level <= 5) return "Dino Hatchling";
  if (level <= 10) return "Fossil Hunter";
  if (level <= 15) return "Rex Tamer";
  if (level <= 20) return "Dino Legend";
  return "Dino God";
}

function tierStyles(tier: Tier) {
  switch (tier) {
    case "bronze":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "silver":
      return "bg-slate-100 text-slate-700 border-slate-300";
    case "gold":
      return "bg-warning/20 text-warning-foreground border-warning";
    case "platinum":
      return "bg-purple/20 text-purple border-purple/40";
  }
}

function daysUntilBirthday(iso: string | null): number | null {
  if (!iso) return null;
  const today = new Date();
  const bd = new Date(iso);
  const next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
  if (next.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) {
    next.setFullYear(today.getFullYear() + 1);
  }
  const ms =
    next.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function eventText(ev: ActivityEv): {
  icon: string;
  text: string;
  subtitle?: string;
  color: string;
} {
  const questTitle = ev.payload.quest_title ?? ev.payload.title ?? "a quest";
  const testTitle = ev.payload.test_title ?? ev.payload.title ?? "a video quiz";
  const score = ev.payload.score ?? ev.payload.score_pct ?? 0;
  switch (ev.event_type) {
    case "quest_completed":
      return {
        icon: "??",
        color: "bg-success/15 text-success-foreground",
        text: `Completed "${questTitle}" (+${ev.payload.xp ?? 0} XP)`,
      };
    case "quest_cycle_created":
      return {
        icon: "??",
        color: "bg-info/15 text-info-foreground",
        text: `New cycle started for '${ev.payload.questTitle ?? questTitle}'`,
      };
    case "quest_missed":
      return {
        icon: "?",
        color: "bg-destructive/15 text-destructive",
        text: `Missed '${ev.payload.questTitle ?? questTitle}' - streak broken`,
      };
    case "test_completed":
      return {
        icon: "??",
        color: "bg-info/15 text-info-foreground",
        text: `Scored ${score}% on "${testTitle}"`,
      };
    case "level_up":
      return {
        icon: "??",
        color: "bg-warning/15 text-warning-foreground",
        text: `Reached Level ${ev.payload.new_level ?? ev.payload.level ?? "new"}!`,
      };
    case "achievement_earned":
      return {
        icon: "??",
        color: "bg-purple/15 text-purple",
        text: `Earned "${ev.payload.achievement_name}" Medal`,
      };
    case "reward_claim_requested":
      return {
        icon: "??",
        color: "bg-pink/15 text-pink",
        text: `Claimed "${ev.payload.reward_title ?? "a reward"}" reward`,
      };
    case "streak_milestone":
      return {
        icon: "??",
        color: "bg-warning/15 text-warning-foreground",
        text: `${ev.payload.n}-day streak achieved!`,
      };
    case "xp_earned":
      return {
        icon: "?",
        color: "bg-primary/15 text-primary-dark",
        text: `${Number(ev.payload.delta ?? ev.payload.xp ?? 0) >= 0 ? "Earned" : "Spent"} ${Math.abs(Number(ev.payload.delta ?? ev.payload.xp ?? 0))} XP`,
      };
    case "parent_reward": {
      const xp = Number(ev.payload.xp ?? 0);
      const coins = Number(ev.payload.coins ?? 0);
      const reason =
        typeof ev.payload.reason === "string"
          ? ev.payload.reason
          : typeof ev.payload.label === "string"
            ? ev.payload.label
            : "Parent reward";
      return {
        icon: "🎁",
        color: "bg-purple/15 text-purple",
        text:
          coins > 0 ? `Direct reward (+${xp} XP, +${coins} coins)` : `Direct reward (+${xp} XP)`,
        subtitle: reason,
      };
    }
  }
}

// ---------- Page ----------

function KidProfilePage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const activeFamilyId = useFamilyStore((s) => s.activeFamilyId);
  const activeFamilyRole = useFamilyStore((s) => s.activeFamilyRole);
  const numericId = Number(userId);
  const isSuperadmin = authUser?.globalRole === "superadmin";

  const { data: familyDetail } = useQuery({
    queryKey: ["family", activeFamilyId],
    queryFn: () => apiRequest<{ id: number; name: string }>(`/api/families/${activeFamilyId}`),
    enabled: !!activeFamilyId,
  });
  const activeFamilyName = familyDetail?.name ?? "Family";

  // Viewer resolution
  const isSelf = authUser?.id === numericId;
  const isParent = activeFamilyRole === "parent";
  const canManageFamilyProfiles = isParent || isSuperadmin;
  const allowed = isSelf || canManageFamilyProfiles;

  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => apiRequest<ProfileData>(`/api/users/${userId}/profile`),
    enabled: !!userId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ["profile-leaderboard", activeFamilyId],
    queryFn: () =>
      apiRequest<LeaderboardPage>(
        `/api/families/${activeFamilyId}/leaderboard?scope=family&limit=200`,
      ),
    enabled: !!activeFamilyId && !!userId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: questsData, isLoading: questsLoading } = useQuery({
    queryKey: ["profile-quests", activeFamilyId],
    queryFn: () => apiRequest<QuestPage>(`/api/families/${activeFamilyId}/quests?limit=100`),
    enabled: !!activeFamilyId && !!userId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: testsData, isLoading: testsLoading } = useQuery({
    queryKey: ["profile-tests", activeFamilyId],
    queryFn: () => apiRequest<TestPage>(`/api/families/${activeFamilyId}/tests?limit=100`),
    enabled: !!activeFamilyId && !!userId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ["activity", activeFamilyId, userId],
    queryFn: () => apiRequest<ActivityApiPage>(`/api/families/${activeFamilyId}/activity?limit=50`),
    enabled: !!activeFamilyId && !!userId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const allEventsForUser = useMemo(() => {
    const targetId = Number(userId);
    const rows = activityData?.items ?? [];
    return rows.filter((row) => row.userId === targetId);
  }, [activityData?.items, userId]);
  const activity = useMemo<ActivityEv[]>(() => {
    const normalize = (eventType: string): ActivityEv["event_type"] => {
      const known = new Set<ActivityEv["event_type"]>([
        "quest_completed",
        "quest_cycle_created",
        "quest_missed",
        "test_completed",
        "level_up",
        "achievement_earned",
        "reward_claim_requested",
        "streak_milestone",
        "xp_earned",
        "parent_reward",
      ]);
      return known.has(eventType as ActivityEv["event_type"])
        ? (eventType as ActivityEv["event_type"])
        : "xp_earned";
    };
    return allEventsForUser.slice(0, 8).map((row) => ({
      id: row.id,
      event_type: normalize(row.eventType),
      created_at: row.createdAt,
      payload: row.payload ?? {},
    }));
  }, [allEventsForUser]);
  const earned = useMemo<Achievement[]>(() => {
    return allEventsForUser
      .filter((row) => row.eventType === "achievement_earned")
      .slice(0, 24)
      .map((row, idx) => ({
        id: row.id,
        name: String(row.payload?.achievement_name ?? `Achievement ${idx + 1}`),
        description: "Earned in family activity",
        tier: "bronze",
        icon: "🏅",
        earned_at: row.createdAt,
      }));
  }, [allEventsForUser]);
  const locked: Achievement[] = [];
  const stats = useMemo<Stats>(() => {
    const targetId = Number(userId);
    const leaderboard = leaderboardData?.items?.find((x) => x.userId === targetId);
    const questAssignments = (questsData?.items ?? [])
      .flatMap((q) => q.assignedMembers ?? [])
      .filter((m) => m.userId === targetId);
    const testAssignments = (testsData?.items ?? [])
      .flatMap((t) => t.assignedMembers ?? [])
      .filter((m) => m.userId === targetId);
    const totalQuestsCompleted = questAssignments.filter((m) => m.status === "completed").length;
    const totalQuestsPending = questAssignments.filter((m) => m.status !== "completed").length;
    const totalTestsCompleted = testAssignments.filter((m) => m.status === "completed").length;
    const scores = allEventsForUser
      .filter((e) => e.eventType === "test_completed")
      .map((e) => Number(e.payload?.score ?? e.payload?.score_pct ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    const avgScore = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    const questsPerDay = new Array(7).fill(0);
    for (const qa of questAssignments) {
      if (!qa.completedAt) continue;
      const d = new Date(qa.completedAt);
      if (d < start || d > now) continue;
      const idx = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (idx >= 0 && idx < 7) questsPerDay[idx] += 1;
    }
    return {
      ...EMPTY_STATS,
      level: leaderboard?.level ?? 1,
      xp_balance: leaderboard?.xp ?? 0,
      coin_balance: leaderboard?.coins ?? 0,
      level_up_cost: Math.max((leaderboard?.level ?? 1) * 50, 50),
      total_quests_completed: totalQuestsCompleted,
      total_quests_pending: totalQuestsPending,
      total_tests_completed: totalTestsCompleted,
      best_test_score_pct: scores.length ? Math.max(...scores) : null,
      avg_test_score_pct: avgScore,
      perfect_scores_count: scores.filter((s) => s >= 100).length,
      quests_last_7_days: questsPerDay,
      test_score_history: scores.slice(-10),
    };
  }, [leaderboardData?.items, questsData?.items, testsData?.items, allEventsForUser, userId]);
  const isLoading =
    profileLoading || leaderboardLoading || questsLoading || testsLoading || activityLoading;
  const selfFallbackProfile: ProfileData | null =
    isSelf && authUser
      ? {
          id: authUser.id,
          username: authUser.username,
          nickname: authUser.username,
          avatar_url: authUser.avatarUrl ?? null,
          birthday: null,
          height_cm: null,
          weight_kg: null,
          gender: null,
          school_grade: null,
          favorite_dino: "",
          catchphrase: "",
          favorite_subject: "Other",
          fun_fact: "",
          joined_at: "1970-01-01T00:00:00Z",
        }
      : null;
  const resolvedProfile = profile ?? selfFallbackProfile;
  const profileLoadFailed =
    profileError instanceof ApiError
      ? profileError.status
      : (profileError as { status?: number } | null)?.status;
  const shouldShowProfileError =
    !resolvedProfile || (profileLoadFailed != null && profileLoadFailed !== 404);

  const updateProfileMutation = useMutation({
    mutationFn: (vals: Partial<ProfileData>) =>
      apiRequest<ProfileData>("/api/users/me/profile", {
        method: "PATCH",
        body: JSON.stringify(vals),
      }),
    onMutate: async (vals) => {
      await queryClient.cancelQueries({ queryKey: ["profile", userId] });
      const previous = queryClient.getQueryData<ProfileData>(["profile", userId]);
      queryClient.setQueryData<ProfileData>(["profile", userId], (old) =>
        old ? { ...old, ...vals } : old,
      );
      return { previous };
    },
    onError: (_err, _vals, context) => {
      queryClient.setQueryData(["profile", userId], context?.previous);
      toast.error("Could not save. Please try again.");
    },
    onSuccess: () => {
      toast.success("Profile updated!");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    },
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiRequest<{ avatar_url: string }>("/api/users/me/avatar", {
        method: "POST",
        body: form,
        headers: {},
      });
    },
    onMutate: async (file) => {
      const previewUrl = URL.createObjectURL(file);
      queryClient.setQueryData<ProfileData>(["profile", userId], (old) =>
        old ? { ...old, avatar_url: previewUrl } : old,
      );
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ProfileData>(["profile", userId], (old) =>
        old ? { ...old, avatar_url: data.avatar_url } : old,
      );
      toast.success("Avatar updated!");
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      toast.error("Could not upload avatar.");
    },
  });

  const updateProfile = (vals: Partial<ProfileData>) => updateProfileMutation.mutate(vals);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const daysLeft = resolvedProfile ? daysUntilBirthday(resolvedProfile.birthday) : null;
  useEffect(() => {
    if (daysLeft === 0) setCelebrate(true);
  }, [daysLeft]);

  if (!allowed) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4">
        <div className="text-7xl">🚫</div>
        <h1 className="font-display font-extrabold text-3xl">Not allowed</h1>
        <p className="text-muted-foreground">You don't have permission to view this profile.</p>
        <Button onClick={() => navigate({ to: "/" })}>Back home</Button>
      </div>
    );
  }

  if (!activeFamilyId && !isSelf && !isSuperadmin) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4">
        <div className="text-7xl">👨‍👩‍👧</div>
        <h1 className="font-display font-extrabold text-2xl">Pick a family</h1>
        <p className="text-muted-foreground">Select a family to view this profile.</p>
        <Button asChild>
          <Link to="/families">Choose family</Link>
        </Button>
      </div>
    );
  }

  if (shouldShowProfileError) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4">
        <div className="text-6xl">⚠️</div>
        <h1 className="font-display font-extrabold text-2xl">Could not load profile</h1>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["profile", userId] })}>
          Try again
        </Button>
      </div>
    );
  }
  if (isLoading) return <ProfileSkeleton />;
  if (!resolvedProfile) return null;

  const rank = rankFromLevel(stats.level);
  const xpPct = Math.min(100, (stats.xp_balance / stats.level_up_cost) * 100);
  const age = resolvedProfile.birthday
    ? differenceInYears(new Date(), new Date(resolvedProfile.birthday))
    : null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6 pb-24">
        {celebrate && <ConfettiStrip />}

        {/* Section 1 — Identity */}
        <IdentityBlock
          profile={resolvedProfile}
          rank={rank}
          familyName={activeFamilyName}
          isSelf={isSelf}
          onEdit={() => setDrawerOpen(true)}
          onAvatarUpload={(file) => avatarMutation.mutate(file)}
        />

        {/* Birthday countdown */}
        {resolvedProfile.birthday && <BirthdayCountdown days={daysLeft!} />}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* LEFT column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Section 4 — XP & Level */}
            <Card>
              <SectionHeader
                icon={<TrendingUp className="size-5" />}
                title="Level & XP"
                caption={`Spendable XP balance in ${activeFamilyName}`}
              />
              <div className="space-y-4">
                <div className="flex items-end justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-display font-black text-4xl text-primary-dark">
                      LVL {stats.level}
                    </div>
                    <div className="text-sm font-bold text-muted-foreground">{rank}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-extrabold tabular-nums">
                      {stats.xp_balance.toLocaleString()} / {stats.level_up_cost.toLocaleString()}{" "}
                      XP
                    </div>
                    <div className="text-xs font-bold text-muted-foreground">
                      Coins: {stats.coin_balance.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Math.max(stats.level_up_cost - stats.xp_balance, 0).toLocaleString()} XP
                      until level up is available
                    </div>
                  </div>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={Math.min(stats.xp_balance, stats.level_up_cost)}
                  aria-valuemin={0}
                  aria-valuemax={stats.level_up_cost}
                  aria-label="XP Progress"
                  className="relative h-5 rounded-full bg-muted overflow-hidden border-2 border-foreground/5"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary-dark rounded-full transition-all"
                    style={{ width: `${xpPct}%` }}
                  />
                </div>
              </div>
            </Card>

            {/* Section 5 — Stats */}
            <Card>
              <SectionHeader icon={<Sparkles className="size-5" />} title="Stats" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile
                  icon={<ListChecks className="size-5" />}
                  label="Quests Completed"
                  value={stats.total_quests_completed}
                  accent="bg-success/15 text-success-foreground"
                />
                <StatTile
                  icon={<Video className="size-5" />}
                  label="Video Quizzes Taken"
                  value={stats.total_tests_completed}
                  accent="bg-info/15 text-info"
                />
                <StatTile
                  icon={<Flame className="size-5" />}
                  label="Current Streak"
                  value={`${stats.current_streak_days} days`}
                  accent="bg-warning/15 text-warning-foreground"
                />
                <StatTile
                  icon={<Trophy className="size-5" />}
                  label="Best Video Quiz Score"
                  value={stats.best_test_score_pct == null ? "—" : `${stats.best_test_score_pct}%`}
                  accent="bg-purple/15 text-purple"
                />
              </div>
            </Card>

            {/* Section 2 — Bio */}
            <BioSection profile={resolvedProfile} isSelf={isSelf} />

            {/* Section 7 — Quest & Video Quiz Summary */}
            <QuestTestSummary stats={stats} />

            {/* Section 6 — Medals */}
            <MedalShowcase earned={earned} locked={locked} />
          </div>

          {/* RIGHT column */}
          <div className="space-y-6">
            {/* Section 3 — Personal Info */}
            <PersonalInfoSection profile={resolvedProfile} age={age} isSelf={isSelf} />

            {/* Section 8 — Activity */}
            <ActivityFeed events={activity} />
          </div>
        </div>

        {/* Edit drawer */}
        {isSelf && (
          <EditProfileDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            profile={resolvedProfile}
            userId={String(userId)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

// ---------- Reusable UI ----------

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-3xl bg-card border-2 border-foreground/5 shadow-pop-sm p-5 md:p-6 space-y-4",
        className,
      )}
      style={{ ["--shadow-color" as any]: "oklch(0 0 0 / 0.06)" }}
    >
      {children}
    </section>
  );
}

function SectionHeader({
  icon,
  title,
  caption,
}: {
  icon?: React.ReactNode;
  title: string;
  caption?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {icon && <span className="text-primary-dark">{icon}</span>}
        <h2 className="font-display font-extrabold text-lg uppercase tracking-wide">{title}</h2>
      </div>
      {caption && <span className="text-xs font-bold text-muted-foreground">{caption}</span>}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl bg-secondary/40 border-2 border-foreground/5 p-4 flex flex-col gap-1">
      <div className={cn("inline-flex w-9 h-9 rounded-xl items-center justify-center", accent)}>
        {icon}
      </div>
      <div className="font-display font-black text-2xl tabular-nums mt-1">{value}</div>
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

// ---------- Sections ----------

function IdentityBlock({
  profile,
  rank,
  familyName,
  isSelf,
  onEdit,
  onAvatarUpload,
}: {
  profile: ProfileData;
  rank: string;
  familyName: string;
  isSelf: boolean;
  onEdit: () => void;
  onAvatarUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const initial = profile.nickname?.[0]?.toUpperCase() ?? "?";

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast.error("Image too large (max 2MB)");
      return;
    }
    if (!/^image\/(jpeg|png)$/.test(f.type)) {
      toast.error("Use JPG or PNG");
      return;
    }
    onAvatarUpload(f);
  };

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-br from-primary/20 via-info/10 to-purple/15 pointer-events-none" />
      <div className="relative flex flex-col md:flex-row md:items-end gap-5">
        {/* Avatar */}
        <div className="relative">
          <button
            type="button"
            onClick={() => isSelf && fileRef.current?.click()}
            aria-label="Upload avatar photo"
            disabled={!isSelf}
            className={cn(
              "size-28 md:size-32 rounded-3xl border-4 border-card shadow-pop-sm bg-gradient-to-br from-primary to-primary-dark text-primary-foreground font-display font-black text-5xl flex items-center justify-center overflow-hidden",
              isSelf && "cursor-pointer hover:scale-[1.02] transition",
            )}
            style={{ ["--shadow-color" as any]: "oklch(0 0 0 / 0.12)" }}
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span>{initial}</span>
            )}
          </button>
          {isSelf && (
            <>
              <span className="absolute -bottom-1 -right-1 bg-warning text-warning-foreground rounded-full p-2 shadow-pop-sm border-2 border-card">
                <Camera className="size-4" />
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={onPick}
              />
            </>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display font-black text-3xl md:text-4xl truncate">
              {profile.nickname}
            </h1>
            <span className="rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide bg-warning text-warning-foreground shadow-pop-sm">
              {rank}
            </span>
          </div>
          <div className="text-sm text-muted-foreground font-medium mt-1">@{profile.username}</div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1 text-xs font-bold">
            👨‍👩‍👧 {familyName}
          </div>
        </div>

        {isSelf && (
          <div className="md:self-center">
            <Button
              onClick={onEdit}
              className="rounded-2xl shadow-pop-sm h-11 px-5 font-display font-extrabold uppercase"
            >
              <Pencil className="size-4" /> Edit profile
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function BirthdayCountdown({ days }: { days: number }) {
  if (days === 0) {
    return (
      <div className="rounded-3xl bg-gradient-to-r from-pink/30 via-warning/30 to-purple/30 border-2 border-pink/40 p-4 flex items-center justify-center gap-3 font-display font-extrabold text-lg">
        🎉 Happy Birthday! 🎂
      </div>
    );
  }
  return (
    <div className="rounded-3xl bg-secondary/60 border-2 border-foreground/5 p-4 flex items-center gap-3">
      <Cake className="size-6 text-pink shrink-0" />
      <div className="font-display font-extrabold">
        Next Birthday in <span className="text-pink">{days}</span> {days === 1 ? "day" : "days"}
      </div>
    </div>
  );
}

function BioSection({ profile, isSelf }: { profile: ProfileData; isSelf: boolean }) {
  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <div className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );

  return (
    <Card>
      <SectionHeader icon={<Star className="size-5" />} title="About Me" />
      <div className="grid md:grid-cols-2 gap-4">
        <F label="Nickname">
          <div className="font-bold">{profile.nickname || "—"}</div>
        </F>
        <F label="Favorite Dinosaur">
          <div className="font-bold">🦖 {profile.favorite_dino || "—"}</div>
        </F>
        <F label="Catchphrase">
          <div className="font-bold italic">
            {profile.catchphrase ? `"${profile.catchphrase}"` : "—"}
          </div>
        </F>
        <F label="Favorite Subject">
          <div className="font-bold">{profile.favorite_subject || "—"}</div>
        </F>
        <div className="md:col-span-2">
          <F label="Fun Fact">
            <div className="font-bold">💡 {profile.fun_fact || "—"}</div>
          </F>
        </div>
      </div>
      {isSelf && (
        <div className="text-xs text-muted-foreground">
          Use Edit profile to update this section.
        </div>
      )}
    </Card>
  );
}

function PersonalInfoSection({
  profile,
  age,
  isSelf,
}: {
  profile: ProfileData;
  age: number | null;
  isSelf: boolean;
}) {
  const Row = ({
    icon,
    label,
    children,
  }: {
    icon: React.ReactNode;
    label: string;
    children: React.ReactNode;
  }) => (
    <div className="flex items-center gap-3 py-2.5 border-b border-foreground/5 last:border-0">
      <div className="size-8 rounded-xl bg-secondary/70 flex items-center justify-center text-primary-dark shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="font-bold text-sm mt-0.5">{children}</div>
      </div>
    </div>
  );

  return (
    <Card>
      <SectionHeader icon={<GraduationCap className="size-5" />} title="Personal Info" />
      <div className="divide-y divide-foreground/5">
        <Row icon={<Cake className="size-4" />} label="Birthday">
          {profile.birthday ? format(new Date(profile.birthday), "MMM d, yyyy") : "—"}
        </Row>
        <Row icon={<Sparkles className="size-4" />} label="Age">
          {age != null ? `${age} years old` : "—"}
        </Row>
        <Row icon={<Ruler className="size-4" />} label="Height">
          {profile.height_cm == null ? "—" : `${profile.height_cm} cm`}
        </Row>
        <Row icon={<Weight className="size-4" />} label="Weight">
          {profile.weight_kg == null ? "—" : `${profile.weight_kg} kg`}
        </Row>
        <Row icon={<span className="text-sm">👤</span>} label="Gender">
          {profile.gender ?? "—"}
        </Row>
        <Row icon={<GraduationCap className="size-4" />} label="Grade">
          {profile.school_grade ?? "—"}
        </Row>
        <Row icon={<CalendarCheck2 className="size-4" />} label="Member Since">
          {format(new Date(profile.joined_at), "MMM d, yyyy")}
        </Row>
      </div>
      {isSelf && (
        <div className="text-xs text-muted-foreground">
          Use Edit profile to update this section.
        </div>
      )}
    </Card>
  );
}

function MedalShowcase({ earned, locked }: { earned: Achievement[]; locked: Achievement[] }) {
  return (
    <Card>
      <SectionHeader
        icon={<Trophy className="size-5" />}
        title="Medals & Achievements"
        caption={`${earned.length} earned`}
      />
      {earned.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-6">
          Complete quests and video quizzes to earn your first medal!
        </div>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {earned.map((a) => (
          <Tooltip key={a.id}>
            <TooltipTrigger asChild>
              <button
                tabIndex={0}
                className="group rounded-2xl border-2 border-foreground/10 bg-secondary/40 p-3 flex flex-col items-center gap-1 hover:-translate-y-0.5 transition shadow-pop-sm"
                style={{ ["--shadow-color" as any]: "oklch(0 0 0 / 0.06)" }}
              >
                <span className="text-3xl">{a.icon}</span>
                <div className="text-xs font-extrabold text-center line-clamp-1">{a.name}</div>
                <span
                  className={cn(
                    "text-[10px] font-black uppercase px-1.5 rounded border",
                    tierStyles(a.tier),
                  )}
                >
                  {a.tier}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="font-bold">{a.description}</div>
              {a.earned_at && (
                <div className="text-xs opacity-80">
                  Earned {format(new Date(a.earned_at), "MMM d, yyyy")}
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
        {locked.map((a) => (
          <Tooltip key={a.id}>
            <TooltipTrigger asChild>
              <button
                tabIndex={0}
                aria-label="Locked achievement"
                className="rounded-2xl border-2 border-dashed border-foreground/15 bg-muted/40 p-3 flex flex-col items-center gap-1 opacity-60 hover:opacity-80 transition"
              >
                <Lock className="size-7 text-muted-foreground" />
                <div className="text-xs font-extrabold text-center">???</div>
                <span className="text-[10px] font-black uppercase px-1.5 rounded border bg-muted text-muted-foreground border-muted-foreground/30">
                  {a.tier}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Keep completing quests to unlock more medals!</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </Card>
  );
}

function QuestTestSummary({ stats }: { stats: Stats }) {
  const dayLabels = ["6d", "5d", "4d", "3d", "2d", "Yest", "Today"];
  const questData = stats.quests_last_7_days.map((v, i) => ({ day: dayLabels[i], count: v }));
  const testData = stats.test_score_history.map((v, i) => ({ attempt: `#${i + 1}`, score: v }));

  return (
    <Card>
      <SectionHeader icon={<Target className="size-5" />} title="Activity Summary" />
      <Tabs defaultValue="quests">
        <TabsList className="rounded-xl">
          <TabsTrigger
            value="quests"
            className="rounded-lg font-display font-extrabold uppercase text-xs"
          >
            Quests
          </TabsTrigger>
          <TabsTrigger
            value="tests"
            className="rounded-lg font-display font-extrabold uppercase text-xs"
          >
            Video Quizzes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quests" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="Completed" value={stats.total_quests_completed} />
            <MiniStat label="Pending" value={stats.total_quests_pending} />
            <MiniStat label="Favorite" value={stats.favorite_quest_category} />
            <MiniStat label="Best Streak" value={`${stats.best_streak_days}d`} />
          </div>
          <div className="h-48 rounded-2xl bg-secondary/30 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={questData}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0 0 0 / 0.08)" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fontWeight: 700 }}
                  stroke="oklch(0 0 0 / 0.4)"
                />
                <YAxis tick={{ fontSize: 11 }} stroke="oklch(0 0 0 / 0.4)" allowDecimals={false} />
                <Bar dataKey="count" fill="oklch(0.74 0.18 142)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="tests" className="space-y-4">
          {stats.total_tests_completed === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              No video quizzes completed yet
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <MiniStat label="Video Quizzes Taken" value={stats.total_tests_completed} />
                <MiniStat label="Average Score" value={`${stats.avg_test_score_pct}%`} />
                <MiniStat label="Perfect Scores" value={stats.perfect_scores_count} />
              </div>
              <div className="h-48 rounded-2xl bg-secondary/30 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={testData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0 0 0 / 0.08)" />
                    <XAxis
                      dataKey="attempt"
                      tick={{ fontSize: 11, fontWeight: 700 }}
                      stroke="oklch(0 0 0 / 0.4)"
                    />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="oklch(0 0 0 / 0.4)" />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="oklch(0.65 0.2 260)"
                      strokeWidth={3}
                      dot={{ r: 5, fill: "oklch(0.65 0.2 260)" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-card border-2 border-foreground/5 p-3">
      <div className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-display font-black text-xl mt-0.5">{value}</div>
    </div>
  );
}

function ActivityFeed({ events }: { events: ActivityEv[] }) {
  return (
    <Card>
      <SectionHeader icon={<CheckCircle2 className="size-5" />} title="Recent Activity" />
      {events.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">
          No activity yet. Start a quest to get going!
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => {
            const v = eventText(ev);
            return (
              <li
                key={ev.id}
                className="flex items-start gap-3 rounded-xl p-2.5 hover:bg-secondary/30 transition"
              >
                <div
                  className={cn(
                    "size-9 rounded-xl flex items-center justify-center text-lg shrink-0",
                    v.color,
                  )}
                >
                  {v.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold leading-tight">{v.text}</div>
                  {v.subtitle && (
                    <div className="text-xs text-muted-foreground mt-0.5">{v.subtitle}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------- Edit Profile Drawer ----------

const editSchema = z.object({
  nickname: z.string().trim().min(1, "Required").max(30),
  catchphrase: z.string().max(80).optional().or(z.literal("")),
  favorite_dino: z.string().max(50).optional().or(z.literal("")),
  favorite_subject: z.enum(FAV_SUBJECTS),
  fun_fact: z.string().max(120).optional().or(z.literal("")),
  height_cm: z.coerce.number().min(50).max(250).nullable(),
  weight_kg: z.coerce.number().min(10).max(200).nullable(),
});
type EditValues = z.infer<typeof editSchema>;

function EditProfileDrawer({
  open,
  onOpenChange,
  profile,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: ProfileData;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      nickname: profile.nickname,
      catchphrase: profile.catchphrase,
      favorite_dino: profile.favorite_dino,
      favorite_subject: profile.favorite_subject,
      fun_fact: profile.fun_fact,
      height_cm: profile.height_cm,
      weight_kg: profile.weight_kg,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        nickname: profile.nickname,
        catchphrase: profile.catchphrase,
        favorite_dino: profile.favorite_dino,
        favorite_subject: profile.favorite_subject,
        fun_fact: profile.fun_fact,
        height_cm: profile.height_cm,
        weight_kg: profile.weight_kg,
      });
    }
  }, [open, profile, reset]);

  const updateProfileMutation = useMutation({
    mutationFn: (vals: Partial<ProfileData>) =>
      apiRequest<ProfileData>("/api/users/me/profile", {
        method: "PATCH",
        body: JSON.stringify(vals),
      }),
    onMutate: async (vals) => {
      await queryClient.cancelQueries({ queryKey: ["profile", userId] });
      const previous = queryClient.getQueryData<ProfileData>(["profile", userId]);
      queryClient.setQueryData<ProfileData>(["profile", userId], (old) =>
        old ? { ...old, ...vals } : old,
      );
      return { previous };
    },
    onError: (_err, _vals, context) => {
      queryClient.setQueryData(["profile", userId], context?.previous);
      toast.error("Could not save. Please try again.");
    },
    onSuccess: () => {
      toast.success("Profile updated!");
      onOpenChange(false);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    },
  });

  const submit = handleSubmit((vals) => {
    const dirtyVals = Object.fromEntries(
      Object.keys(dirtyFields).map((k) => [k, vals[k as keyof EditValues]]),
    ) as Partial<ProfileData>;
    updateProfileMutation.mutate(dirtyVals);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display font-black text-2xl">Edit profile</SheetTitle>
          <SheetDescription>Update your bio and personal info.</SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="space-y-4 mt-4">
          <Field label="Nickname" error={errors.nickname?.message}>
            <Input {...register("nickname")} maxLength={30} />
          </Field>
          <Field label="Catchphrase" error={errors.catchphrase?.message as any}>
            <Input {...register("catchphrase")} maxLength={80} />
          </Field>
          <Field label="Favorite dinosaur" error={errors.favorite_dino?.message as any}>
            <Input {...register("favorite_dino")} maxLength={50} />
          </Field>
          <Field label="Favorite subject" error={errors.favorite_subject?.message as any}>
            <Select
              value={watch("favorite_subject")}
              onValueChange={(v) => setValue("favorite_subject", v as any, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FAV_SUBJECTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fun fact" error={errors.fun_fact?.message as any}>
            <Textarea rows={3} maxLength={120} {...register("fun_fact")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Height (cm)" error={errors.height_cm?.message as any}>
              <Input type="number" min={50} max={250} {...register("height_cm")} />
            </Field>
            <Field label="Weight (kg)" error={errors.weight_kg?.message as any}>
              <Input type="number" step={0.1} min={10} max={200} {...register("weight_kg")} />
            </Field>
          </div>

          <SheetFooter className="flex flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              <X className="size-4" /> Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="flex-1 rounded-xl shadow-pop-sm font-display font-extrabold uppercase"
            >
              <Save className="size-4" /> {updateProfileMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  const id = useMemo(() => `f-${label.replace(/\s+/g, "-").toLowerCase()}`, [label]);
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </Label>
      <div aria-describedby={error ? `${id}-err` : undefined}>{children}</div>
      {error && (
        <div id={`${id}-err`} className="text-xs font-bold text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

// ---------- Skeleton & confetti ----------

function ProfileSkeleton() {
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <Skeleton className="h-44 rounded-3xl" />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-40 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-96 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
        </div>
      </div>
    </div>
  );
}

function ConfettiStrip() {
  const colors = ["bg-primary", "bg-warning", "bg-info", "bg-pink", "bg-purple"];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {Array.from({ length: 40 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "absolute top-0 w-2 h-3 rounded-sm animate-bounce",
            colors[i % colors.length],
          )}
          style={{
            left: `${(i * 97) % 100}%`,
            animationDelay: `${(i % 10) * 0.1}s`,
            animationDuration: `${1 + (i % 5) * 0.3}s`,
            transform: `rotate(${i * 23}deg)`,
          }}
        />
      ))}
    </div>
  );
}
