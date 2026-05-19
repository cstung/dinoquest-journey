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
import { apiRequest } from "@/lib/api";
import { useAuthStore, useFamilyStore } from "@/store";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DinoQuest — Learn. Quest. Level up." },
      { name: "description", content: "Make learning free, fun, and effective for the whole family." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
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
  const [authCheckDone, setAuthCheckDone] = useState(isAuthPage);

  useFamilyRealtime(activeFamilyId, isAuthenticated, queryClient);

  useEffect(() => {
    if (isAuthPage) {
      setAuthCheckDone(true);
      return;
    }

    setAuthCheckDone(false);
    let active = true;
    apiRequest<{ id: number; username: string; email: string | null; globalRole: "user" | "superadmin" }>(
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
        setAuthCheckDone(true);
      })
      .catch(() => {
        if (!active) return;
        logout();
        setAuthCheckDone(true);
        navigate({ to: "/login", replace: true });
      });
    return () => {
      active = false;
    };
  }, [isAuthPage, login, logout, navigate]);

  return (
    <QueryClientProvider client={queryClient}>
      {isAuthPage ? (
        <Outlet />
      ) : !isAuthenticated ? (
        authCheckDone ? null : <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Checking session...</div>
      ) : (
        <AppShell />
      )}
      <Toaster />
    </QueryClientProvider>
  );
}
