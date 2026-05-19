import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuthStore, useFamilyStore } from "@/store";
import { apiRequest } from "@/lib/api";

type LoginResponse = {
  id: number;
  username: string;
  email: string | null;
  globalRole: "user" | "superadmin";
  activeFamilyId: number | null;
  role: "parent" | "child" | null;
};

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const setActiveFamily = useFamilyStore((s) => s.setActiveFamily);
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      login({
        id: user.id,
        username: user.username,
        email: user.email ?? "",
        globalRole: user.globalRole,
        level: 1,
        xp: 0,
        xpToNext: 100,
        streak: 0,
      });
      if (user.activeFamilyId && user.role) {
        setActiveFamily(user.activeFamilyId, user.role);
        nav({ to: "/families/$familyId", params: { familyId: String(user.activeFamilyId) } });
      } else {
        nav({ to: "/families" });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary-light via-background to-info/20 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="text-6xl mb-2 inline-block animate-bounce-soft">🦖</div>
          <h1 className="text-4xl text-primary-dark">DinoQuest</h1>
          <p className="text-muted-foreground font-bold">Learn. Quest. Level up.</p>
        </div>
        <form
          onSubmit={submit}
          className="rounded-3xl bg-card border-2 border-border p-6 space-y-4 card-pop"
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
              Username
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-primary"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-primary"
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-3.5 btn-pop disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/register" className="text-primary font-bold hover:underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
