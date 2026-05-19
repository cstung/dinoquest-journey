import { useEffect } from "react";
import { Bell, ChevronDown, Check, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useFamilyStore, useAuthStore } from "@/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useFamilies, useFamilyActivity } from "@/hooks/use-families";
import { apiRequest } from "@/lib/api";

function DinoLogo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <div className="size-9 rounded-2xl bg-primary grid place-items-center text-xl shadow-pop-sm">
        🦖
      </div>
      <span className="font-display font-extrabold text-xl text-primary-dark tracking-tight hidden sm:inline">
        DinoQuest
      </span>
    </Link>
  );
}

function FamilySwitcher() {
  const { activeFamilyId, setActiveFamily } = useFamilyStore();
  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.globalRole === "superadmin";
  const { data: families = [] } = useFamilies();
  const active = families.find((f) => f.id === activeFamilyId) ?? families[0];

  useEffect(() => {
    if (!activeFamilyId && families.length > 0) {
      setActiveFamily(families[0].id, families[0].myRole);
    }
  }, [activeFamilyId, families, setActiveFamily]);

  if (families.length === 0) {
    return (
      <Link
        to="/families"
        className="rounded-2xl border-2 border-border bg-card px-3 py-2 text-sm font-bold"
      >
        Select Family
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-2xl border-2 border-border bg-card px-3 py-2 hover:bg-secondary/50 transition-colors max-w-[260px]">
          <span
            className="size-3 rounded-full shrink-0"
            style={{ backgroundColor: active?.colorHex }}
          />
          <span className="font-display font-bold text-sm truncate">{active?.name}</span>
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-72">
        {families.map((f) => (
          <DropdownMenuItem
            key={f.id}
            onClick={() => setActiveFamily(f.id, f.myRole)}
            className="flex items-center gap-3 py-2.5"
          >
            <span className="size-3 rounded-full" style={{ backgroundColor: f.colorHex }} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{f.name}</div>
              <div className="text-xs text-muted-foreground capitalize">{f.myRole}</div>
            </div>
            {f.id === active?.id && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {isSuperadmin && (
          <DropdownMenuItem asChild>
            <Link to="/families/new" className="flex items-center gap-2">
              <Plus className="size-4" /> Create Family
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationDrawer() {
  const activeFamilyId = useFamilyStore((s) => s.activeFamilyId);
  const { data, isLoading } = useFamilyActivity(activeFamilyId, "activity", !!activeFamilyId);
  const events = data?.items ?? [];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="relative size-10 rounded-2xl border-2 border-border bg-card hover:bg-secondary/50 grid place-items-center transition-colors">
          <Bell className="size-5" strokeWidth={2.5} />
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="flex flex-row items-center justify-between">
          <SheetTitle className="font-display text-2xl">Notifications</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 overflow-y-auto px-4 pb-6">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading notifications...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No notifications yet</div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className={cn(
                  "rounded-2xl border-2 p-3 flex gap-3 transition-colors",
                  "bg-card border-border",
                )}
              >
                <div className="size-10 shrink-0 rounded-xl bg-card grid place-items-center text-lg">
                  {event.eventType.includes("quest") && "⚔️"}
                  {event.eventType.includes("test") && "📝"}
                  {event.eventType.includes("xp") && "⭐"}
                  {event.eventType.includes("reward") && "🎁"}
                  {!event.eventType.includes("quest") &&
                    !event.eventType.includes("test") &&
                    !event.eventType.includes("xp") &&
                    !event.eventType.includes("reward") &&
                    "📣"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-sm">{event.eventType.replaceAll("_", " ")}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{event.username ?? "System"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(event.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function UserMenu() {
  const { user, logout } = useAuthStore();
  const initials = user?.username.slice(0, 2).toUpperCase() ?? "??";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="size-10 rounded-2xl bg-info text-info-foreground font-display font-extrabold grid place-items-center hover:opacity-90 shadow-pop-sm">
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5">
          <div className="font-bold text-sm">{user?.username}</div>
          <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild disabled={!user?.id}>
          <Link to="/profile/$userId" params={{ userId: String(user?.id ?? "") }}>
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            try {
              await apiRequest<void>("/api/auth/logout", { method: "DELETE" });
            } finally {
              logout();
            }
          }}
          className="text-destructive"
        >
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-16">
        <DinoLogo />
        <div className="hidden md:flex flex-1 justify-center">
          <FamilySwitcher />
        </div>
        <div className="flex items-center gap-2">
          <div className="md:hidden">
            <FamilySwitcher />
          </div>
          <NotificationDrawer />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
