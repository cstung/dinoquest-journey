import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useFamilies } from "@/hooks/use-families";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const [search, setSearch] = useState("");
  const { data: families = [], isLoading, error } = useFamilies();
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return families;
    return families.filter((f) => f.name.toLowerCase().includes(q));
  }, [families, search]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-purple to-pink text-white p-6 shadow-pop-lg">
        <h1 className="text-3xl text-white">Admin — All Families</h1>
        <p className="text-white/85 font-bold">
          Showing families available to your current account.
        </p>
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search families..."
        className="w-full rounded-2xl border-2 border-border bg-card px-4 py-2.5 font-bold focus:outline-none focus:border-purple"
      />
      <div className="rounded-2xl bg-card border-2 border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 p-4 border-b-2 border-border bg-secondary/40 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
          <div>Family</div>
          <div>Members</div>
          <div>Role</div>
          <div>Actions</div>
        </div>

        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading families...</div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">Failed to load families.</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No families found.</div>
        ) : (
          filtered.map((f) => (
            <div
              key={f.id}
              className="grid grid-cols-[1fr_auto_auto_auto] gap-4 p-4 items-center border-b border-border last:border-0"
            >
              <div className="flex items-center gap-3">
                <span className="size-3 rounded-full" style={{ backgroundColor: f.colorHex }} />
                <Link
                  to="/families/$familyId"
                  params={{ familyId: String(f.id) }}
                  className="font-display font-extrabold hover:underline"
                >
                  {f.name}
                </Link>
              </div>
              <div className="font-bold text-sm">{f.memberCount}</div>
              <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded bg-primary/15 text-primary-dark">
                {f.myRole}
              </span>
              <span className="text-xs text-muted-foreground">Manage in Family page</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
