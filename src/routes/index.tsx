import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuthStore, useFamilyStore } from "@/store";
import { XPBar } from "@/components/xp-bar";
import { quests, tests, activity, pets, families, children } from "@/data/mock";
import { ListChecks, Trophy, Flame, ArrowRight, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({ component: HomePage });

function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const tod = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return <h1 className="text-3xl sm:text-4xl">{tod}, {name}! 👋</h1>;
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className={`rounded-2xl p-4 border-2 ${color}`}>
      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide opacity-80">
        {icon}{label}
      </div>
      <div className="font-display text-3xl font-extrabold mt-1">{value}</div>
    </div>
  );
}

function HomePage() {
  const user = useAuthStore((s) => s.user);
  const { activeFamilyId } = useFamilyStore();
  const family = families.find((f) => f.id === activeFamilyId);
  const activePet = pets.find((p) => p.active);

  if (!activeFamilyId || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="text-center max-w-md space-y-4">
          <div className="text-7xl">🦖</div>
          <h2 className="text-3xl">Welcome to DinoQuest!</h2>
          <p className="text-muted-foreground">Create a family or join an existing one to get started.</p>
          <div className="flex gap-3 justify-center">
            <Link to="/families/new" className="rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase px-6 py-3 btn-pop">Create</Link>
            <Link to="/families/join" className="rounded-2xl bg-card border-2 border-border font-display font-extrabold uppercase px-6 py-3">Join</Link>
          </div>
        </div>
      </div>
    );
  }

  const upcoming = quests.filter((q) => q.status === "pending").slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Greeting + XP */}
      <div className="rounded-3xl bg-gradient-to-br from-primary to-primary-dark text-primary-foreground p-6 sm:p-8 shadow-pop-lg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Greeting name={user.username} />
            <div className="mt-2 inline-flex items-center gap-2 bg-white/15 backdrop-blur rounded-full px-3 py-1 text-sm font-bold">
              <span className="size-2 rounded-full" style={{ backgroundColor: family?.colorHex }} />
              {family?.name}
            </div>
          </div>
          <div className="flex items-center gap-2 bg-warning rounded-2xl px-4 py-2 shadow-pop-sm">
            <Flame className="size-5" />
            <span className="font-display font-extrabold text-xl">{user.streak}</span>
            <span className="font-bold text-sm uppercase">day streak</span>
          </div>
        </div>
        <div className="mt-6 bg-white/15 backdrop-blur rounded-2xl p-4">
          <XPBar currentXP={user.xp} maxXP={user.xpToNext} level={user.level} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<ListChecks className="size-4" />} label="Pending quests" value={upcoming.length} color="bg-info/10 border-info/20 text-info" />
        <Stat icon={<Sparkles className="size-4" />} label="Done today" value={2} color="bg-primary/10 border-primary/20 text-primary-dark" />
        <Stat icon={<Trophy className="size-4" />} label="This week XP" value="320" color="bg-warning/10 border-warning/20 text-warning" />
        <Stat icon={<Flame className="size-4" />} label="Best score" value="95%" color="bg-purple/10 border-purple/20 text-purple" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Upcoming */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl">Up next</h2>
            <Link to="/quests" className="text-sm font-bold text-primary inline-flex items-center gap-1 hover:underline">
              View all <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {upcoming.map((q) => (
              <Link
                key={q.id}
                to="/quests/$questId"
                params={{ questId: String(q.id) }}
                className="rounded-2xl bg-card border-2 border-border p-4 card-pop hover:border-primary/40 transition-colors block"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold uppercase tracking-wide px-2 py-1 rounded-md bg-primary/15 text-primary-dark">
                    {q.category}
                  </span>
                  <span className="text-xs font-extrabold text-warning">+{q.xp} XP</span>
                </div>
                <h3 className="font-display font-extrabold text-base leading-tight">{q.title}</h3>
                {q.dueDate && <p className="text-xs text-muted-foreground mt-2">Due {q.dueDate}</p>}
              </Link>
            ))}
            {tests.slice(0, 1).map((t) => (
              <Link
                key={t.id}
                to="/tests"
                className="rounded-2xl bg-card border-2 border-border p-4 card-pop hover:border-info/40 transition-colors block"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold uppercase tracking-wide px-2 py-1 rounded-md bg-info/15 text-info">
                    Test
                  </span>
                  <span className="text-xs font-extrabold text-warning">+{t.xp} XP</span>
                </div>
                <h3 className="font-display font-extrabold text-base leading-tight">{t.title}</h3>
                <p className="text-xs text-muted-foreground mt-2">{t.questionCount} questions · {t.timeLimit} min</p>
              </Link>
            ))}
          </div>

          {/* Activity */}
          <div className="rounded-2xl bg-card border-2 border-border p-4 mt-4">
            <h3 className="font-display font-extrabold mb-3">Recent activity</h3>
            <ul className="space-y-3">
              {activity.slice(0, 5).map((a) => {
                const c = children.find((c) => c.name === a.who);
                return (
                  <li key={a.id} className="flex items-center gap-3 text-sm">
                    <span
                      className="size-8 rounded-xl grid place-items-center text-xs font-extrabold text-white shrink-0"
                      style={{ backgroundColor: c?.avatarColor ?? "#999" }}
                    >
                      {a.who.slice(0, 1)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold">{a.who}</span>{" "}
                      <span className="text-muted-foreground">{a.message}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{a.time}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Pet Widget */}
        <div className="rounded-3xl bg-gradient-to-br from-info/15 to-purple/15 border-2 border-info/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-extrabold">Your dino</h3>
            <Link to="/pets" className="text-xs font-bold text-info hover:underline">View →</Link>
          </div>
          <div className="text-center py-4">
            <div className="text-8xl animate-bounce-soft inline-block">{activePet?.emoji}</div>
            <h4 className="font-display font-extrabold text-2xl mt-2">{activePet?.name}</h4>
            <p className="text-sm text-muted-foreground capitalize">{activePet?.species} · {activePet?.stage}</p>
          </div>
          <div className="bg-card rounded-2xl p-3">
            <XPBar currentXP={activePet?.xp ?? 0} maxXP={activePet?.xpToNext ?? 100} level={activePet?.level ?? 1} size="sm" showNumbers={false} />
            <p className="text-xs text-muted-foreground mt-2">Last fed: {activePet?.lastFed}</p>
          </div>
          <button className="w-full rounded-2xl bg-warning text-warning-foreground font-display font-extrabold uppercase py-3 shadow-pop-sm hover:opacity-90">
            🍖 Feed Pet
          </button>
        </div>
      </div>
    </div>
  );
}
