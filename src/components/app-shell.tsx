import { Outlet } from "@tanstack/react-router";
import { Topbar } from "./topbar";
import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";

export function AppShell() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Topbar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
