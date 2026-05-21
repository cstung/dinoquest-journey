import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Clock, Play, Plus, Power, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFamilyStore } from "@/store";
import { ActionResultModal, type ActionResultVariant } from "@/components/action-result-modal";
import {
  useReopenRequests,
  useResolveReopenRequest,
  useRequestReopen,
  useTests,
  useUpdateTestAvailability,
  useDeleteTest,
  type TestListItem,
} from "@/hooks/use-tests";

export const Route = createFileRoute("/tests/")({ component: TestsPage });

type ActionResult = {
  title: string;
  message: string;
  variant: ActionResultVariant;
};

function TestsPage() {
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const isParent = role === "parent";
  const [tab, setTab] = useState<"all" | "open" | "completed" | "inactive">("all");
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useTests(familyId, { status: "all", search });
  const tests = useMemo(() => {
    const all = data?.items ?? [];
    if (tab === "all") return all;
    if (tab === "inactive") return all.filter((item) => item.availabilityStatus === "inactive");
    if (tab === "open") {
      if (isParent) {
        return all.filter(
          (item) =>
            item.availabilityStatus === "active" &&
            (item.status === "published" || item.status === "reopen_requested"),
        );
      }
      return all.filter((item) => item.status === "published");
    }
    return all.filter((item) => item.status === "completed" || item.status === "reopen_requested");
  }, [data?.items, tab, isParent]);
  const reopenCount = useMemo(
    () =>
      (data?.items ?? []).reduce(
        (acc, item) => acc + (item.status === "reopen_requested" ? 1 : 0),
        0,
      ),
    [data?.items],
  );

  if (!familyId) {
    return (
      <div className="py-10 text-sm text-muted-foreground">
        Select a family first to view tests.
      </div>
    );
  }

  if (isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">Loading tests...</div>;
  }

  if (error) {
    return <div className="py-10 text-sm text-destructive">Failed to load tests.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl">{isParent ? "Tests" : "My Tests"}</h1>
        {isParent && (
          <Link
            to="/tests/new"
            className="rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase px-5 py-3 shadow-pop-sm inline-flex items-center gap-2"
          >
            <Plus className="size-5" strokeWidth={3} /> New Test
          </Link>
        )}
      </div>

      {reopenCount > 0 && isParent && (
        <div className="rounded-2xl bg-warning/15 border-2 border-warning/30 p-4 flex items-center gap-3">
          <AlertCircle className="size-5 text-warning shrink-0" />
          <p className="text-sm font-bold">
            <span className="text-warning">
              {reopenCount} reopen request{reopenCount > 1 ? "s" : ""}
            </span>{" "}
            waiting for your approval.
          </p>
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search tests..."
        className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-info"
      />

      <div className="flex gap-2 border-b-2 border-border overflow-x-auto">
        {(isParent ? ["all", "open", "completed", "inactive"] : ["all", "open", "completed"]).map(
          (t) => (
            <button
              key={t}
              onClick={() => setTab(t as "all" | "open" | "completed" | "inactive")}
              className={cn(
                "px-4 py-2.5 font-display font-extrabold uppercase text-sm tracking-wide border-b-4 -mb-0.5 whitespace-nowrap transition-colors",
                tab === t
                  ? "border-info text-info"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "all"
                ? "All"
                : t === "open"
                  ? "Open"
                  : t === "completed"
                    ? "Completed"
                    : "Inactive"}
            </button>
          ),
        )}
      </div>

      <div className="grid gap-4">
        {tests.map((test) => (
          <TestCard key={test.id} test={test} familyId={familyId} isParent={isParent} />
        ))}
      </div>

      {tests.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-3">No tests yet.</div>
          <p className="font-bold">Create one from a YouTube video to get started.</p>
        </div>
      )}
    </div>
  );
}

function TestCard({
  test,
  familyId,
  isParent,
}: {
  test: TestListItem;
  familyId: number;
  isParent: boolean;
}) {
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const reopenMutation = useRequestReopen(familyId, test.id);
  const availabilityMutation = useUpdateTestAvailability(familyId, test.id);
  const deleteMutation = useDeleteTest(familyId, test.id);
  const reopenRequestsQuery = useReopenRequests(
    familyId,
    test.id,
    isParent && test.reopenPendingCount > 0,
  );
  const resolveReopenMutation = useResolveReopenRequest(familyId, test.id);
  const isInactive = test.availabilityStatus === "inactive";

  const requestReopen = async () => {
    setActionResult(null);
    try {
      await reopenMutation.mutateAsync({ reason: "Need another attempt to improve score" });
      setActionResult({
        title: "Pending Approval",
        message: "Reopen request sent to parent.",
        variant: "warning",
      });
    } catch (err) {
      setActionResult({
        title: "Action Failed",
        message: (err as Error).message,
        variant: "error",
      });
    }
  };

  const resolveReopen = async (requestId: number, decision: "approve" | "reject") => {
    setActionResult(null);
    try {
      const result = await resolveReopenMutation.mutateAsync({ requestId, decision });
      setActionResult({
        title: decision === "approve" ? "Approved" : "Rejected",
        message:
          decision === "approve"
            ? `Reopen approved (XP delta ${result.xpDelta}).`
            : "Reopen request rejected.",
        variant: decision === "approve" ? "success" : "warning",
      });
    } catch (err) {
      setActionResult({
        title: "Action Failed",
        message: (err as Error).message,
        variant: "error",
      });
    }
  };

  const toggleAvailability = async () => {
    setActionResult(null);
    try {
      await availabilityMutation.mutateAsync({ isActive: isInactive });
      setActionResult({
        title: isInactive ? "Activated" : "Deactivated",
        message: isInactive ? "Test is now open for children." : "Test is now inactive.",
        variant: "success",
      });
    } catch (err) {
      setActionResult({
        title: "Action Failed",
        message: (err as Error).message,
        variant: "error",
      });
    }
  };

  const deleteTest = async () => {
    const confirmed = window.confirm(`Delete "${test.title}"? This cannot be undone.`);
    if (!confirmed) return;
    setActionResult(null);
    try {
      await deleteMutation.mutateAsync();
      setActionResult({
        title: "Deleted",
        message: "Test deleted successfully.",
        variant: "success",
      });
    } catch (err) {
      setActionResult({
        title: "Delete Failed",
        message: (err as Error).message,
        variant: "error",
      });
    }
  };

  return (
    <div className="rounded-2xl bg-card border-2 border-border p-4 card-pop flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative aspect-video sm:w-64 shrink-0 rounded-xl overflow-hidden bg-muted">
          {test.thumbnailUrl ? (
            <img
              src={test.thumbnailUrl}
              alt={test.title}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
              No thumbnail
            </div>
          )}
          <div className="absolute inset-0 bg-black/30 grid place-items-center opacity-0 hover:opacity-100 transition-opacity">
            <div className="size-12 rounded-full bg-info text-info-foreground grid place-items-center">
              <Play className="size-6 ml-0.5" fill="currentColor" />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <StatusBadge status={test.status} />
              <AvailabilityBadge availabilityStatus={test.availabilityStatus} />
              <DifficultyBadge difficulty={test.difficulty} />
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                Subtitles: {subtitleSourceLabel(test.subtitleSource)}
              </span>
            </div>
            <h3 className="font-display font-extrabold text-lg leading-tight">{test.title}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
              <span>{test.questionCount} questions</span>
              <span className="size-1 rounded-full bg-muted-foreground" />
              <span className="flex items-center gap-1">
                <Clock className="size-3" /> {test.timeLimitMin} min
              </span>
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex -space-x-2">
              {test.assignedMembers.map((m) => (
                <span
                  key={m.userId}
                  className="size-7 rounded-xl border-2 border-card grid place-items-center text-[10px] font-extrabold text-white"
                  style={{ backgroundColor: m.avatarColor ?? "#9ca3af" }}
                  title={m.username}
                >
                  {m.username.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-extrabold text-warning">+{test.maxXp} XP</span>
              {isParent ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleAvailability}
                    disabled={availabilityMutation.isPending}
                    className="rounded-xl bg-secondary font-display font-extrabold uppercase text-xs px-3 py-2 inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    <Power className="size-3.5" />
                    {availabilityMutation.isPending
                      ? "Saving..."
                      : isInactive
                        ? "Activate"
                        : "Deactivate"}
                  </button>
                  <button
                    onClick={deleteTest}
                    disabled={deleteMutation.isPending}
                    className="rounded-xl bg-destructive/20 text-destructive font-display font-extrabold uppercase text-xs px-3 py-2 inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    <Trash2 className="size-3.5" />
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {test.status === "completed" ? (
                    <button
                      onClick={requestReopen}
                      disabled={reopenMutation.isPending}
                      className="rounded-xl bg-secondary font-display font-extrabold uppercase text-xs px-3 py-2"
                    >
                      {reopenMutation.isPending ? "Sending..." : "Request Reopen"}
                    </button>
                  ) : test.status === "reopen_requested" ? (
                    <span className="rounded-xl bg-warning/20 text-warning font-display font-extrabold uppercase text-xs px-3 py-2">
                      Retry Requested
                    </span>
                  ) : (
                    <>
                      <Link
                        to="/tests/$testId/take"
                        params={{ testId: String(test.id) }}
                        className={cn(
                          "rounded-xl font-display font-extrabold uppercase text-xs px-3 py-2 inline-flex items-center",
                          isInactive
                            ? "bg-muted text-muted-foreground pointer-events-none"
                            : "bg-primary text-primary-foreground btn-pop",
                        )}
                      >
                        {isInactive ? "Inactive" : "Start Test"}
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isParent && (reopenRequestsQuery.data?.length ?? 0) > 0 && (
        <div className="rounded-2xl border-2 border-border p-4 bg-background space-y-3">
          <h4 className="font-display font-extrabold text-base">Pending Reopen Requests</h4>
          {(reopenRequestsQuery.data ?? []).map((req) => {
            const member = test.assignedMembers.find((m) => m.userId === req.requestedBy);
            return (
              <div
                key={req.id}
                className="rounded-xl border border-border p-3 flex items-center gap-3 flex-wrap"
              >
                <div className="flex-1 min-w-[220px]">
                  <p className="font-bold text-sm">
                    {member?.username ?? `User ${req.requestedBy}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Requested {new Date(req.requestedAt).toLocaleString()}
                  </p>
                  {req.reason && <p className="text-xs text-muted-foreground mt-1">{req.reason}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => resolveReopen(req.id, "approve")}
                    disabled={resolveReopenMutation.isPending}
                    className="rounded-lg bg-primary text-primary-foreground text-xs font-extrabold uppercase px-3 py-2"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => resolveReopen(req.id, "reject")}
                    disabled={resolveReopenMutation.isPending}
                    className="rounded-lg bg-secondary text-xs font-extrabold uppercase px-3 py-2"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    published: "bg-info/15 text-info",
    completed: "bg-primary/15 text-primary-dark",
    reopen_requested: "bg-warning/15 text-warning",
  };
  const label: Record<string, string> = {
    draft: "Draft",
    published: "Pending",
    completed: "Done",
    reopen_requested: "Reopen Requested",
  };
  return (
    <span
      className={cn(
        "text-[10px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-md",
        map[status],
      )}
    >
      {label[status] ?? status}
    </span>
  );
}

function AvailabilityBadge({ availabilityStatus }: { availabilityStatus: string }) {
  const cls =
    availabilityStatus === "inactive"
      ? "bg-muted text-muted-foreground"
      : "bg-emerald-100 text-emerald-700";
  const label = availabilityStatus === "inactive" ? "Inactive" : "Active";
  return (
    <span
      className={cn("text-[10px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-md", cls)}
    >
      {label}
    </span>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const label = difficulty === "easy" ? "Easy" : difficulty === "hard" ? "Hard (Tricky)" : "Medium";
  return (
    <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-md bg-secondary text-secondary-foreground">
      {label}
    </span>
  );
}

function subtitleSourceLabel(source: string): string {
  if (source === "youtube_manual") return "YouTube Manual";
  if (source === "youtube_auto") return "YouTube Auto";
  if (source === "youtube_translated") return "YouTube Translated";
  if (source === "whisper") return "Whisper";
  return "Fallback";
}
