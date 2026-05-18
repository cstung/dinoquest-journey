import { createFileRoute, Link } from "@tanstack/react-router";
import { families } from "@/data/mock";

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-purple to-pink text-white p-6 shadow-pop-lg">
        <h1 className="text-3xl text-white">Admin — All Families</h1>
        <p className="text-white/85 font-bold">Super-admin overview</p>
      </div>
      <input placeholder="Search families..." className="w-full rounded-2xl border-2 border-border bg-card px-4 py-2.5 font-bold focus:outline-none focus:border-purple" />
      <div className="rounded-2xl bg-card border-2 border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 p-4 border-b-2 border-border bg-secondary/40 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
          <div>Family</div><div>Members</div><div>Status</div><div>Actions</div>
        </div>
        {families.map((f) => (
          <div key={f.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 p-4 items-center border-b border-border last:border-0">
            <div className="flex items-center gap-3">
              <span className="size-3 rounded-full" style={{ backgroundColor: f.colorHex }} />
              <Link to="/families/$familyId" params={{ familyId: String(f.id) }} className="font-display font-extrabold hover:underline">{f.name}</Link>
            </div>
            <div className="font-bold text-sm">{f.memberCount}</div>
            <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded bg-primary/15 text-primary-dark">Active</span>
            <button className="text-xs font-bold text-destructive hover:underline">Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
