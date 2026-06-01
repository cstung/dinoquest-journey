import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import appCss from "../styles.css?url";
import { AppShell } from "@/components/app-shell";
import { useFamilyRealtime } from "@/hooks/use-realtime";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore, useFamilyStore } from "@/store";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0f766e" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "DinoQuest" },
      { title: "DinoQuest — Learn. Quest. Level up." },
      { name: "description", content: "Make learning free, fun, and effective for the whole family." },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/pwa-icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/pwa-icon-512.png" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeFamilyId = useFamilyStore((s) => s.activeFamilyId);
  const setActiveFamily = useFamilyStore((s) => s.setActiveFamily);
  const [authCheckDone, setAuthCheckDone] = useState(isAuthPage);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authRetry, setAuthRetry] = useState(0);

  useFamilyRealtime(activeFamilyId, isAuthenticated, queryClient);

  useEffect(() => {
    if (!import.meta.env.PROD || typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/sw.js");
    });
  }, []);

  useEffect(() => {
    if (isAuthPage) {
      setAuthError(null);
      setAuthCheckDone(true);
      return;
    }

    setAuthCheckDone(false);
    setAuthError(null);
    let active = true;
    apiRequest<{
      id: number;
      username: string;
      email: string | null;
      globalRole: "user" | "superadmin";
      activeFamilyId: number | null;
      role: "parent" | "child" | null;
    }>(
      "/api/auth/me",
    )
      .then((user) => {
        if (!active) return;
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
        }
        setAuthError(null);
        setAuthCheckDone(true);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) {
          logout();
          setAuthCheckDone(true);
          navigate({ to: "/login", replace: true });
          return;
        }
        setAuthError("Unable to verify session right now. Please retry.");
        setAuthCheckDone(true);
      });
    return () => {
      active = false;
    };
  }, [isAuthPage, login, logout, navigate, setActiveFamily, authRetry]);

  return (
    <QueryClientProvider client={queryClient}>
      {isAuthPage ? (
        <Outlet />
      ) : !authCheckDone ? (
        <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Checking session...</div>
      ) : authError ? (
        <div className="min-h-screen grid place-items-center px-4">
          <div className="rounded-2xl border-2 border-border bg-card p-6 text-center space-y-3 max-w-md w-full">
            <p className="text-sm text-muted-foreground">{authError}</p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => setAuthRetry((v) => v + 1)}
                className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-bold"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: "/login", replace: true })}
                className="rounded-xl bg-secondary px-4 py-2 text-sm font-bold"
              >
                Login
              </button>
            </div>
          </div>
        </div>
      ) : !isAuthenticated ? (
        <Outlet />
      ) : (
        <AppShell />
      )}
      <Toaster />
    </QueryClientProvider>
  );
}
