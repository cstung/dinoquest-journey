import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuthStore, useFamilyStore } from "@/store";
import { apiRequest } from "@/lib/api";

type RegisterResponse = {
  id: number;
  username: string;
  email: string | null;
  globalRole: "user" | "superadmin";
  activeFamilyId: number | null;
  activeFamilyName: string | null;
  role: "parent" | "child" | null;
};

export const Route = createFileRoute("/register")({ component: RegisterPage });

function RegisterPage() {
  const login = useAuthStore((s) => s.login);
  const setActiveFamily = useFamilyStore((s) => s.setActiveFamily);
  const nav = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [hideInviteCode, setHideInviteCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const setup = params.get("setup") === "1";
    const code = params.get("code") ?? "";
    setHideInviteCode(setup);
    setInviteCode(code);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await apiRequest<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username,
          email: email.trim() ? email.trim() : null,
          password,
          inviteCode: hideInviteCode ? null : inviteCode.trim(),
        }),
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
      const message = (err as Error).message;
      setError(message);
      toast.error(message);
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
          <p className="text-muted-foreground font-bold">Create your account</p>
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
              required
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9_]{3,30}"
              title="Use 3-30 letters, numbers, or underscores."
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
              Email (optional)
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              required
              minLength={12}
            />
          </label>
          {!hideInviteCode && (
            <label className="block space-y-1.5">
              <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                Invite Code
              </span>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-primary tracking-[0.2em] uppercase"
                placeholder="042819"
                required
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">Password must be at least 12 characters.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-3.5 btn-pop disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-bold hover:underline">
              Log In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
