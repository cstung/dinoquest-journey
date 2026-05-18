import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const nav = useNavigate();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ id: 1, username: "Alex", email: "alex@dinoquest.app", globalRole: "superadmin", level: 7, xp: 1240, xpToNext: 1500, streak: 12 });
    nav({ to: "/" });
  };
  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary-light via-background to-info/20 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="text-6xl mb-2 inline-block animate-bounce-soft">🦖</div>
          <h1 className="text-4xl text-primary-dark">DinoQuest</h1>
          <p className="text-muted-foreground font-bold">Learn. Quest. Level up.</p>
        </div>
        <form onSubmit={submit} className="rounded-3xl bg-card border-2 border-border p-6 space-y-4 card-pop">
          <label className="block space-y-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Username</span>
            <input className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-primary" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Password</span>
            <input type="password" className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-primary" />
          </label>
          <button className="w-full rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-3.5 btn-pop">Log In</button>
          <p className="text-center text-sm text-muted-foreground">No account? <Link to="/login" className="text-primary font-bold hover:underline">Register</Link></p>
        </form>
      </div>
    </div>
  );
}
