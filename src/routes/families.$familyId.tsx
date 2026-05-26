import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Users, Mail, Activity, Shield, Settings, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore, useFamilyStore } from "@/store";
import { ActionResultModal, type ActionResultVariant } from "@/components/action-result-modal";
import {
  useCreateInvite,
  useDeleteFamily,
  useFamilyActivity,
  useFamilyDetail,
  useFamilyInvites,
  useFamilyJoinRequests,
  useFamilyMembers,
  useRemoveMember,
  useResolveJoinRequest,
  useRevokeInvite,
  useUpdateMemberRole,
  useUpdateFamily,
} from "@/hooks/use-families";

export const Route = createFileRoute("/families/$familyId")({ component: FamilyDetail });

const TABS = [
  { id: "members", label: "Members", icon: Users },
  { id: "invites", label: "Invites", icon: Mail },
  { id: "join-requests", label: "Join Requests", icon: Mail },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "audit", label: "Audit", icon: Shield },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

type ActionResult = {
  title: string;
  message: string;
  variant: ActionResultVariant;
};

function FamilyDetail() {
  const nav = useNavigate();
  const { familyId } = useParams({ from: "/families/$familyId" });
  const user = useAuthStore((s) => s.user);
  const activeFamilyId = useFamilyStore((s) => s.activeFamilyId);
  const clearActiveFamily = useFamilyStore((s) => s.clear);
  const familyIdNum = Number(familyId);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("members");
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [inviteRole, setInviteRole] = useState<"parent" | "child">("child");
  const [latestJoinLink, setLatestJoinLink] = useState<string | null>(null);

  const detailQuery = useFamilyDetail(familyIdNum);
  const isSuperadmin = user?.globalRole === "superadmin";
  const canManageMembers = isSuperadmin || detailQuery.data?.myRole === "parent";
  const membersQuery = useFamilyMembers(familyIdNum);
  const invitesQuery = useFamilyInvites(familyIdNum, tab === "invites" && canManageMembers);
  const joinRequestsQuery = useFamilyJoinRequests(
    familyIdNum,
    tab === "join-requests" && canManageMembers,
  );
  const activityQuery = useFamilyActivity(familyIdNum, "activity", tab === "activity");
  const auditQuery = useFamilyActivity(familyIdNum, "audit", tab === "audit");
  const createInvite = useCreateInvite(familyIdNum);
  const revokeInvite = useRevokeInvite(familyIdNum);
  const resolveJoinRequest = useResolveJoinRequest(familyIdNum);
  const updateMemberRole = useUpdateMemberRole(familyIdNum);
  const removeMember = useRemoveMember(familyIdNum);
  const updateFamily = useUpdateFamily(familyIdNum);
  const deleteFamily = useDeleteFamily(familyIdNum);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const family = detailQuery.data;
  const members = membersQuery.data ?? [];
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
    setActionResult(null);
    try {
      await revokeInvite.mutateAsync(inviteId);
      setActionResult({ title: "Updated", message: "Invite revoked.", variant: "success" });
    } catch (err) {
      setActionResult({
        title: "Action Failed",
        message: (err as Error).message,
        variant: "error",
      });
    }
  };

  const onRoleChange = async (userId: number, role: "parent" | "child") => {
    setActionResult(null);
    try {
      await updateMemberRole.mutateAsync({ userId, role });
      setActionResult({ title: "Updated", message: "Member role updated.", variant: "success" });
    } catch (err) {
      setActionResult({
        title: "Action Failed",
        message: (err as Error).message,
        variant: "error",
      });
    }
  };

  const onRemoveMember = async (userId: number) => {
    setActionResult(null);
    try {
      await removeMember.mutateAsync(userId);
      setActionResult({ title: "Updated", message: "Member removed.", variant: "success" });
    } catch (err) {
      setActionResult({
        title: "Action Failed",
        message: (err as Error).message,
        variant: "error",
      });
    }
  };

  const onDeleteFamily = async () => {
    setActionResult(null);
    try {
      await deleteFamily.mutateAsync();
      if (activeFamilyId === familyIdNum) {
        clearActiveFamily();
      }
      nav({ to: "/families" });
    } catch (err) {
      setActionResult({
        title: "Action Failed",
        message: (err as Error).message,
        variant: "error",
      });
    }
  };

  const onResolveJoinRequest = async (joinRequestId: number, status: "approved" | "rejected") => {
    setActionResult(null);
    try {
      await resolveJoinRequest.mutateAsync({ joinRequestId, status });
      setActionResult({
        title: status === "approved" ? "Approved" : "Rejected",
        message: status === "approved" ? "Join request approved." : "Join request rejected.",
        variant: status === "approved" ? "success" : "warning",
      });
    } catch (err) {
      setActionResult({
        title: "Action Failed",
        message: (err as Error).message,
        variant: "error",
      });
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
                {canManageMembers && (
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
              disabled={!canManageMembers || createInvite.isPending}
              className="rounded-2xl border-2 border-border bg-background px-4 py-2.5 text-sm font-bold disabled:opacity-60"
            >
              <option value="child">Child</option>
              <option value="parent">Parent</option>
            </select>
            <button
              disabled={!canManageMembers || createInvite.isPending}
              onClick={() =>
                createInvite.mutate(
                  { role: inviteRole },
                  {
                    onSuccess: (invite) => {
                      setLatestJoinLink(invite.joinLink);
                    },
                  },
                )
              }
              className="rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase px-5 py-3 shadow-pop-sm disabled:opacity-60"
            >
              {createInvite.isPending ? "Generating..." : "+ Generate New Invite"}
            </button>
          </div>
          {latestJoinLink && (
            <div className="rounded-2xl bg-card border-2 border-border p-4 space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                Latest Join Link
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={latestJoinLink}
                  className="flex-1 rounded-xl border-2 border-border bg-background px-3 py-2 text-xs font-bold"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(latestJoinLink);
                    setActionResult({
                      title: "Copied",
                      message: "Join link copied.",
                      variant: "info",
                    });
                  }}
                  className="rounded-xl bg-secondary font-display font-extrabold uppercase text-xs px-4"
                >
                  Copy Link
                </button>
              </div>
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
                  <div className="mt-2 flex gap-2">
                    <input
                      readOnly
                      value={inv.joinLink}
                      className="flex-1 rounded-xl border border-border bg-background px-2 py-1.5 text-xs font-bold"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(inv.joinLink);
                        setActionResult({
                          title: "Copied",
                          message: "Join link copied.",
                          variant: "info",
                        });
                      }}
                      className="rounded-lg bg-secondary px-2 py-1 text-xs font-bold"
                    >
                      Copy
                    </button>
                  </div>
                  {inv.qrJoinLink && (
                    <div className="mt-2 flex gap-2">
                      <input
                        readOnly
                        value={inv.qrJoinLink}
                        className="flex-1 rounded-xl border border-border bg-background px-2 py-1.5 text-xs font-bold"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(inv.qrJoinLink as string);
                          setActionResult({
                            title: "Copied",
                            message: "QR join link copied.",
                            variant: "info",
                          });
                        }}
                        className="rounded-lg bg-secondary px-2 py-1 text-xs font-bold"
                      >
                        Copy QR
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {(invitesQuery.data ?? []).length === 0 && (
                <div className="text-sm text-muted-foreground">No active invites.</div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "join-requests" && (
        <div className="space-y-3">
          {!canManageMembers ? (
            <div className="text-sm text-muted-foreground">
              Only parents can manage join requests.
            </div>
          ) : joinRequestsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading join requests...</div>
          ) : (joinRequestsQuery.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No pending join requests.</div>
          ) : (
            (joinRequestsQuery.data ?? []).map((req) => (
              <div
                key={req.id}
                className="rounded-2xl bg-card border-2 border-border p-4 flex items-center gap-3"
              >
                <div className="flex-1">
                  <p className="font-bold">{req.username}</p>
                  <p className="text-xs text-muted-foreground">
                    Requested {new Date(req.requestedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onResolveJoinRequest(req.id, "approved")}
                  disabled={resolveJoinRequest.isPending}
                  className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-extrabold uppercase disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onResolveJoinRequest(req.id, "rejected")}
                  disabled={resolveJoinRequest.isPending}
                  className="rounded-lg bg-secondary px-3 py-2 text-xs font-extrabold uppercase disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            ))
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
              <div
                className={cn(
                  "size-9 rounded-xl grid place-items-center",
                  a.eventType === "parent_reward" ? "bg-purple/15 text-purple" : "bg-primary/15",
                )}
              >
                {a.eventType === "parent_reward" ? (
                  <Gift className="size-4" />
                ) : (
                  <Activity className="size-4" />
                )}
              </div>
              <div className="flex-1">
                <span className="font-bold">{a.username ?? "System"}</span>{" "}
                <span className="text-muted-foreground">
                  {formatFamilyEvent(a.eventType, a.payload)}
                </span>
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
              <div
                className={cn(
                  "size-9 rounded-xl grid place-items-center",
                  a.eventType === "parent_reward" ? "bg-purple/15 text-purple" : "bg-warning/15",
                )}
              >
                {a.eventType === "parent_reward" ? (
                  <Gift className="size-4" />
                ) : (
                  <Shield className="size-4" />
                )}
              </div>
              <div className="flex-1">
                <span className="font-bold">{a.username ?? "System"}</span>{" "}
                <span className="text-muted-foreground">
                  {formatFamilyEvent(a.eventType, a.payload)}
                </span>
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
            disabled={!canManageMembers || updateFamily.isPending}
            className="rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase px-6 py-3 btn-pop disabled:opacity-60"
          >
            {updateFamily.isPending ? "Saving..." : "Save"}
          </button>
          {isSuperadmin && (
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
      <ActionResultModal
        open={!!actionResult}
        title={actionResult?.title ?? ""}
        message={actionResult?.message ?? ""}
        variant={actionResult?.variant}
        onClose={() => setActionResult(null)}
      />
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-primary";

function formatFamilyEvent(eventType: string, payload: Record<string, unknown> | null): string {
  const p = payload ?? {};
  const role = typeof p.role === "string" ? p.role : null;
  switch (eventType) {
    case "family_created":
      return "created this family";
    case "family_updated":
      return "updated family settings";
    case "family_deleted":
      return "deleted this family";
    case "member_joined":
      return role ? `joined as ${role}` : "joined the family";
    case "member_removed":
      return "removed a family member";
    case "invite_sent":
      return "created an invite";
    case "invite_revoked":
      return "revoked an invite";
    case "join_request_resolved":
      return typeof p.status === "string"
        ? `resolved a join request (${p.status})`
        : "resolved a join request";
    case "parent_reward": {
      const xp = Number(p.xp ?? 0);
      const childName = typeof p.childName === "string" ? p.childName : "child";
      const isAudit = p.audit === true;
      if (isAudit) {
        return `You awarded ${xp.toLocaleString()} XP to ${childName}`;
      }
      return `received a direct reward (+${xp.toLocaleString()} XP)`;
    }
    default:
      return eventType.replaceAll("_", " ");
  }
}

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
