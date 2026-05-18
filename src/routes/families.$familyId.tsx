import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { families, children, activity } from "@/data/mock";
import { ArrowLeft, Users, Mail, UserPlus, Activity, Shield, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/families/$familyId")({ component: FamilyDetail });

const TABS = [
  { id: "members", label: "Members", icon: Users },
  { id: "invites", label: "Invites", icon: Mail },
  { id: "requests", label: "Requests", icon: UserPlus },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "audit", label: "Audit", icon: Shield },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

function FamilyDetail() {
  const { familyId } = useParams({ from: "/families/$familyId" });
  const family = families.find((f) => f.id === Number(familyId));
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("members");

  if (!family) return <div>Family not found</div>;

  return (
    <div className="space-y-6">
      <Link to="/families" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground"><ArrowLeft className="size-4" /> Families</Link>

      <div className="rounded-3xl bg-card border-2 border-border p-6 flex items-center gap-4">
        <div className="size-16 rounded-2xl grid place-items-center text-2xl font-display font-extrabold text-white shrink-0" style={{ backgroundColor: family.colorHex }}>
          {family.name.slice(0, 1)}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl">{family.name}</h1>
          <p className="text-muted-foreground italic">{family.motto}</p>
          <p className="text-xs font-bold text-muted-foreground mt-1">{family.memberCount} members</p>
        </div>
      </div>

      <div className="flex gap-1 border-b-2 border-border overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2.5 font-display font-extrabold uppercase text-xs tracking-wide border-b-4 -mb-0.5 whitespace-nowrap inline-flex items-center gap-2 transition-colors",
                tab === t.id ? "border-primary text-primary-dark" : "border-transparent text-muted-foreground"
              )}
            >
              <Icon className="size-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "members" && (
        <div className="rounded-2xl bg-card border-2 border-border overflow-hidden">
          {children.map((c, i) => (
            <div key={c.id} className={cn("flex items-center gap-3 p-4", i > 0 && "border-t border-border")}>
              <div className="size-10 rounded-xl grid place-items-center text-sm font-extrabold text-white" style={{ backgroundColor: c.avatarColor }}>{c.name.slice(0, 1)}</div>
              <div className="flex-1">
                <div className="font-bold">{c.name}</div>
                <div className="text-xs text-muted-foreground">Joined Jan 2026</div>
              </div>
              <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded bg-info/15 text-info">Child</span>
              <button className="text-xs font-bold text-muted-foreground hover:text-destructive">Remove</button>
            </div>
          ))}
        </div>
      )}

      {tab === "invites" && (
        <div className="space-y-4">
          <button className="rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase px-5 py-3 shadow-pop-sm">+ Generate New Invite</button>
          <div className="rounded-2xl bg-card border-2 border-border p-6 text-center">
            <div className="font-display font-extrabold text-5xl tracking-[0.3em] text-primary">A3K9P2</div>
            <p className="text-sm text-muted-foreground mt-3">Expires in 7 days</p>
            <div className="size-32 mx-auto mt-4 bg-foreground rounded-2xl grid place-items-center text-card text-xs">QR Code</div>
            <div className="flex gap-2 mt-4 justify-center">
              <button className="rounded-xl bg-secondary font-bold text-xs px-4 py-2">Copy Code</button>
              <button className="rounded-xl bg-secondary font-bold text-xs px-4 py-2">Download QR</button>
            </div>
          </div>
        </div>
      )}

      {tab === "requests" && (
        <div className="text-center py-12 text-muted-foreground">
          <UserPlus className="size-12 mx-auto mb-2 opacity-50" />
          <p className="font-bold">No pending join requests.</p>
        </div>
      )}

      {tab === "activity" && (
        <ul className="space-y-2">
          {activity.map((a) => (
            <li key={a.id} className="rounded-2xl bg-card border-2 border-border p-4 flex items-center gap-3 text-sm">
              <div className="size-9 rounded-xl bg-primary/15 grid place-items-center">⚔️</div>
              <div className="flex-1"><span className="font-bold">{a.who}</span> <span className="text-muted-foreground">{a.message}</span></div>
              <span className="text-xs text-muted-foreground">{a.time}</span>
            </li>
          ))}
        </ul>
      )}

      {tab === "audit" && (
        <div className="text-center py-12 text-muted-foreground">
          <Shield className="size-12 mx-auto mb-2 opacity-50" />
          <p className="font-bold">No admin actions logged yet.</p>
        </div>
      )}

      {tab === "settings" && (
        <div className="rounded-3xl bg-card border-2 border-border p-6 space-y-5">
          <Field label="Family Name"><input defaultValue={family.name} className={inputCls} /></Field>
          <Field label="Family Motto"><input defaultValue={family.motto} className={inputCls} /></Field>
          <button className="rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase px-6 py-3 btn-pop">Save</button>
          <div className="border-t-2 border-destructive/20 pt-5">
            <h3 className="font-display font-extrabold text-destructive">Danger zone</h3>
            <p className="text-sm text-muted-foreground my-2">Deleting a family removes all members and data permanently.</p>
            <button className="rounded-2xl bg-destructive text-destructive-foreground font-display font-extrabold uppercase px-5 py-2.5">Delete Family</button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-primary";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}
