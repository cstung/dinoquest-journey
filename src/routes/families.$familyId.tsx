import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Users, Mail, Activity, Shield, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore, useFamilyStore } from "@/store";
import {
  useCreateInvite,
  useDeleteFamily,
  useFamilyActivity,
  useFamilyDetail,
  useFamilyInvites,
  useFamilyMembers,
  useRemoveMember,
  useRevokeInvite,
  useUpdateMemberRole,
  useUpdateFamily,
} from "@/hooks/use-families";

export const Route = createFileRoute("/families/$familyId")({ component: FamilyDetail });

const TABS = [
  { id: "members", label: "Members", icon: Users },
  { id: "invites", label: "Invites", icon: Mail },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "audit", label: "Audit", icon: Shield },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

function FamilyDetail() {
  const nav = useNavigate();
  const { familyId } = useParams({ from: "/families/$familyId" });
  const user = useAuthStore((s) => s.user);
  const activeFamilyId = useFamilyStore((s) => s.activeFamilyId);
  const clearActiveFamily = useFamilyStore((s) => s.clear);
  const familyIdNum = Number(familyId);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("members");
  const [message, setMessage] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [inviteRole, setInviteRole] = useState<"parent" | "child">("child");

  const detailQuery = useFamilyDetail(familyIdNum);
  const canManage = detailQuery.data?.myRole === "parent";
  const isSuperadmin = user?.globalRole === "superadmin";
  const membersQuery = useFamilyMembers(familyIdNum);
  const invitesQuery = useFamilyInvites(familyIdNum, tab === "invites" && canManage);
  const activityQuery = useFamilyActivity(familyIdNum, "activity", tab === "activity");
  const auditQuery = useFamilyActivity(familyIdNum, "audit", tab === "audit");
  const createInvite = useCreateInvite(familyIdNum);
  const revokeInvite = useRevokeInvite(familyIdNum);
  const updateMemberRole = useUpdateMemberRole(familyIdNum);
  const removeMember = useRemoveMember(familyIdNum);
  const updateFamily = useUpdateFamily(familyIdNum);
  const deleteFamily = useDeleteFamily(familyIdNum);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const family = detailQuery.data;
  const members = membersQuery.data ?? [];
  const isOwner = !!user && !!family && user.id === family.ownerId;
  const [name, setName] = useState("");
  const [motto, setMotto] = useState("");

  useEffect(() => {
    if (family) {
      setName(family.name);
      setMotto(family.motto ?? "");
    }
  }, [family]);

  if (detailQuery.isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">Loading family...</div>;
  }
  if (detailQuery.error || !family) {
    return <div className="py-10 text-sm text-destructive">Family not found or inaccessible.</div>;
  }

  const submitSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    try {
      await updateFamily.mutateAsync({ name, motto: motto || null });
    } catch (err) {
      setSettingsError((err as Error).message);
    }
  };

  const onRevokeInvite = async (inviteId: number) => {
    setMessage(null);
    try {
      await revokeInvite.mutateAsync(inviteId);
      setMessage("Invite revoked.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const onRoleChange = async (userId: number, role: "parent" | "child") => {
    setMessage(null);
    try {
      await updateMemberRole.mutateAsync({ userId, role });
      setMessage("Member role updated.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const onRemoveMember = async (userId: number) => {
    setMessage(null);
    try {
      await removeMember.mutateAsync(userId);
      setMessage("Member removed.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const onDeleteFamily = async () => {
    setMessage(null);
    try {
      await deleteFamily.mutateAsync();
      if (activeFamilyId === familyIdNum) {
        clearActiveFamily();
      }
      nav({ to: "/families" });
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        to="/families"
        className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> Families
      </Link>

      <div className="rounded-3xl bg-card border-2 border-border p-6 flex items-center gap-4">
        <div
          className="size-16 rounded-2xl grid place-items-center text-2xl font-display font-extrabold text-white shrink-0"
          style={{ backgroundColor: family.colorHex }}
        >
          {family.name.slice(0, 1)}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl">{family.name}</h1>
          <p className="text-muted-foreground italic">{family.motto ?? "No motto set"}</p>
          <p className="text-xs font-bold text-muted-foreground mt-1">
            {family.memberCount} members
          </p>
        </div>
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="flex gap-1 border-b-2 border-border overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2.5 font-display font-extrabold uppercase text-xs tracking-wide border-b-4 -mb-0.5 whitespace-nowrap inline-flex items-center gap-2 transition-colors",
                tab === t.id
                  ? "border-primary text-primary-dark"
                  : "border-transparent text-muted-foreground",
              )}
            >
              <Icon className="size-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "members" && (
        <div className="rounded-2xl bg-card border-2 border-border overflow-hidden">
          {membersQuery.isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading members...</div>
          ) : members.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No members.</div>
          ) : (
            members.map((m, i) => (
              <div
                key={m.userId}
                className={cn("flex items-center gap-3 p-4", i > 0 && "border-t border-border")}
              >
                <div
                  className="size-10 rounded-xl grid place-items-center text-sm font-extrabold text-white"
                  style={{ backgroundColor: m.avatarColor ?? "#9ca3af" }}
                >
                  {m.username.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-bold">{m.username}</div>
                  <div className="text-xs text-muted-foreground">
                    Joined {new Date(m.joinedAt).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-[10px] font-extrabold uppercase px-2 py-1 rounded bg-info/15 text-info">
                  {m.role}
                </span>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <select
                      value={m.role}
                      onChange={(e) => onRoleChange(m.userId, e.target.value as "parent" | "child")}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-bold"
                      disabled={updateMemberRole.isPending}
                    >
                      <option value="child">Child</option>
                      <option value="parent">Parent</option>
                    </select>
                    <button
                      onClick={() => onRemoveMember(m.userId)}
                      disabled={removeMember.isPending || m.userId === user?.id}
                      className="text-xs font-bold text-destructive disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "invites" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "parent" | "child")}
              disabled={!isSuperadmin || createInvite.isPending}
              className="rounded-2xl border-2 border-border bg-background px-4 py-2.5 text-sm font-bold disabled:opacity-60"
            >
              <option value="child">Child</option>
              <option value="parent">Parent</option>
            </select>
            <button
              disabled={!isSuperadmin || createInvite.isPending}
              onClick={() => createInvite.mutate({ role: inviteRole })}
              className="rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase px-5 py-3 shadow-pop-sm disabled:opacity-60"
            >
              {createInvite.isPending ? "Generating..." : "+ Generate New Invite"}
            </button>
            <button
              disabled={!canManage}
              onClick={() => setShowQr((v) => !v)}
              className="rounded-2xl bg-secondary font-display font-extrabold uppercase px-5 py-3 disabled:opacity-60"
            >
              {showQr ? "Hide QR" : "Show Latest QR"}
            </button>
          </div>
          {showQr && (
            <div className="rounded-2xl bg-card border-2 border-border p-4 inline-block">
              <img
                src={`/api/families/${familyIdNum}/invite/qr?ts=${Date.now()}`}
                alt="Family invite QR"
                className="size-56 rounded-xl bg-white p-2"
              />
            </div>
          )}
          {invitesQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading invites...</div>
          ) : (
            <div className="space-y-3">
              {(invitesQuery.data ?? []).map((inv) => (
                <div key={inv.id} className="rounded-2xl bg-card border-2 border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-extrabold uppercase tracking-wide text-info mb-1">
                        {inv.role === "parent" ? "Parent" : "Child"}
                      </div>
                      <div className="font-display font-extrabold text-3xl tracking-[0.2em] text-primary">
                        {inv.code}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Expires {new Date(inv.expiresAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => onRevokeInvite(inv.id)}
                      disabled={revokeInvite.isPending}
                      className="text-xs font-bold text-destructive disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Token: {inv.qrToken.slice(0, 10)}...
                  </p>
                </div>
              ))}
              {(invitesQuery.data ?? []).length === 0 && (
                <div className="text-sm text-muted-foreground">No active invites.</div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "activity" && (
        <ul className="space-y-2">
          {(activityQuery.data?.items ?? []).map((a) => (
            <li
              key={a.id}
              className="rounded-2xl bg-card border-2 border-border p-4 flex items-center gap-3 text-sm"
            >
              <div className="size-9 rounded-xl bg-primary/15 grid place-items-center">⚔️</div>
              <div className="flex-1">
                <span className="font-bold">{a.username ?? "System"}</span>{" "}
                <span className="text-muted-foreground">{a.eventType}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(a.createdAt).toLocaleTimeString()}
              </span>
            </li>
          ))}
          {(activityQuery.data?.items?.length ?? 0) === 0 && (
            <li className="text-sm text-muted-foreground">No activity yet.</li>
          )}
        </ul>
      )}

      {tab === "audit" && (
        <ul className="space-y-2">
          {(auditQuery.data?.items ?? []).map((a) => (
            <li
              key={a.id}
              className="rounded-2xl bg-card border-2 border-border p-4 flex items-center gap-3 text-sm"
            >
              <div className="size-9 rounded-xl bg-warning/15 grid place-items-center">🛡️</div>
              <div className="flex-1">
                <span className="font-bold">{a.username ?? "System"}</span>{" "}
                <span className="text-muted-foreground">{a.eventType}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(a.createdAt).toLocaleTimeString()}
              </span>
            </li>
          ))}
          {(auditQuery.data?.items?.length ?? 0) === 0 && (
            <li className="text-sm text-muted-foreground">No audit entries yet.</li>
          )}
        </ul>
      )}

      {tab === "settings" && (
        <form
          onSubmit={submitSettings}
          className="rounded-3xl bg-card border-2 border-border p-6 space-y-5"
        >
          <Field label="Family Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Family Motto">
            <input value={motto} onChange={(e) => setMotto(e.target.value)} className={inputCls} />
          </Field>
          {settingsError && <p className="text-sm text-destructive">{settingsError}</p>}
          <button
            disabled={!canManage || updateFamily.isPending}
            className="rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase px-6 py-3 btn-pop disabled:opacity-60"
          >
            {updateFamily.isPending ? "Saving..." : "Save"}
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={onDeleteFamily}
              disabled={deleteFamily.isPending}
              className="rounded-2xl bg-destructive text-destructive-foreground font-display font-extrabold uppercase px-6 py-3 disabled:opacity-60 ml-2"
            >
              {deleteFamily.isPending ? "Deleting..." : "Delete Family"}
            </button>
          )}
        </form>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-primary";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
