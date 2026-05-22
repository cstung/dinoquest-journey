import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ListChecks, Video, Trophy, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CalendarDays, Egg, Gift, Users, Shield } from "lucide-react";
import { useAuthStore } from "@/store";

const primary = [
  { icon: Home, label: "Home", to: "/" },
  { icon: ListChecks, label: "Quests", to: "/quests" },
  { icon: Video, label: "Video Quiz", to: "/tests" },
  { icon: Trophy, label: "Leaderboard", to: "/leaderboard" },
] as const;

const more = [
  { icon: CalendarDays, label: "Calendar", to: "/calendar" },
  { icon: Egg, label: "Pets", to: "/pets" },
  { icon: Gift, label: "Rewards", to: "/rewards" },
  { icon: Users, label: "Families", to: "/families" },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = useAuthStore((s) => s.user);

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-md">
      <div className="grid grid-cols-5 h-16">
        {primary.map((item) => {
          const active =
            item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" strokeWidth={2.5} />
              {item.label}
            </Link>
          );
        })}
        <Sheet>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
              <Menu className="size-5" strokeWidth={2.5} />
              More
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl">
            <SheetHeader>
              <SheetTitle className="font-display text-2xl">More</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-3 p-4">
              {more.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-secondary/60 font-bold text-sm"
                  >
                    <Icon className="size-6" strokeWidth={2.5} />
                    {item.label}
                  </Link>
                );
              })}
              {user?.globalRole === "superadmin" && (
                <Link
                  to="/admin"
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-purple/10 text-purple font-bold text-sm"
                >
                  <Shield className="size-6" strokeWidth={2.5} />
                  Admin
                </Link>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
