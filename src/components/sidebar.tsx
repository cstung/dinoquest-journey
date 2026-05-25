import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  ListChecks,
  Video,
  CalendarDays,
  Trophy,
  Trees,
  Egg,
  Gift,
  Users,
  Shield,
  Medal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore, useFamilyStore } from "@/store";
import { XPBar } from "./xp-bar";
import { useLeaderboard } from "@/hooks/use-leaderboard";

const navItems = [
  { icon: ListChecks, label: "Quests", to: "/quests" },
  { icon: Video, label: "Video Quiz", to: "/tests" },
  { icon: CalendarDays, label: "Calendar", to: "/calendar" },
  { icon: Trophy, label: "Leaderboard", to: "/leaderboard" },
  { icon: Egg, label: "Pets", to: "/pets" },
  { icon: Gift, label: "Rewards", to: "/rewards" },
  { icon: Medal, label: "Achievements", to: "/achievements" },
] as const;

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = useAuthStore((s) => s.user);
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const activeFamilyRole = useFamilyStore((s) => s.activeFamilyRole);
  const isSuperAdmin = user?.globalRole === "superadmin";
  const isKid = activeFamilyRole === "child";
  const familyYardActive =
    familyId != null && pathname.startsWith(`/families/${familyId}/dashboard`);
  const leaderboard = useLeaderboard(familyId, "family");
  const myEntry = (leaderboard.data?.items ?? []).find((item) => item.isYou) ?? null;
  const level = myEntry?.level ?? 1;
  const balance = myEntry?.xp ?? 0;
  const xpToNext = 50 * Math.max(level, 1);
  const currentXp = Math.min(balance, xpToNext);
  const streak = myEntry?.currentStreak ?? 0;

  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        <Link
          to="/"
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-2xl font-display font-extrabold text-sm transition-all border-2 border-transparent",
            pathname === "/"
              ? "bg-sidebar-accent text-sidebar-accent-foreground border-primary/30"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50",
          )}
        >
          <Home className="size-5" strokeWidth={2.5} />
          <span className="uppercase tracking-wide">Home</span>
        </Link>
        {familyId != null && (
          <Link
            to="/families/$familyId/dashboard"
            params={{ familyId: String(familyId) }}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-2xl font-display font-extrabold text-sm transition-all border-2 border-transparent",
              familyYardActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground border-primary/30"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50",
            )}
          >
            <Trees className="size-5" strokeWidth={2.5} />
            <span className="uppercase tracking-wide">Family Yard</span>
          </Link>
        )}
        {navItems.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-2xl font-display font-extrabold text-sm transition-all border-2 border-transparent",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-primary/30"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <Icon className="size-5" strokeWidth={2.5} />
              <span className="uppercase tracking-wide">{item.label}</span>
            </Link>
          );
        })}
        {!isKid && (
          <Link
            to="/families"
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-2xl font-display font-extrabold text-sm transition-all border-2 border-transparent",
              pathname.startsWith("/families") && !familyYardActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground border-primary/30"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50",
            )}
          >
            <Users className="size-5" strokeWidth={2.5} />
            <span className="uppercase tracking-wide">Families</span>
          </Link>
        )}
        {isSuperAdmin && (
          <Link
            to="/admin"
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-2xl font-display font-extrabold text-sm transition-all border-2 border-transparent",
              pathname.startsWith("/admin")
                ? "bg-purple/15 text-purple border-purple/30"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50",
            )}
          >
            <Shield className="size-5" strokeWidth={2.5} />
            <span className="uppercase tracking-wide">Admin</span>
          </Link>
        )}
      </div>
      {user && (
        <div className="p-4 border-t border-sidebar-border">
          <div className="rounded-2xl bg-secondary/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wide">
                Your XP
              </span>
              <span className="text-xs font-bold text-primary-dark">🔥 {streak}d</span>
            </div>
            <XPBar currentXP={currentXp} maxXP={xpToNext} level={level} size="sm" showNumbers={false} />
            <div className="text-xs text-muted-foreground tabular-nums">
              {balance} XP balance
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
