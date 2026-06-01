import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Clock, Edit3, Play, Plus, Power, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn, formatXp } from "@/lib/utils";
import { useFamilyStore } from "@/store";
import { useFamilyMembers } from "@/hooks/use-families";
import { ActionResultModal, type ActionResultVariant } from "@/components/action-result-modal";
import {
  useDeleteTest,
  useReopenRequests,
  useResolveReopenRequest,
  useRequestReopen,
  useTestAnalytics,
  useTestForEdit,
  useTests,
  useUpdateTest,
  useUpdateTestAvailability,
  type TestDifficulty,
  type TestListItem,
} from "@/hooks/use-tests";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/tests/")({ component: TestsPage });

type ActionResult = {
  title: string;
  message: string;
  variant: ActionResultVariant;
};

type EditQuestion = {
  id: number;
  questionText: string;
  options: [string, string, string, string];
  correctOption: number;
};

type EditForm = {
  title: string;
  difficulty: TestDifficulty;
  timeLimitMin: number;
  maxXp: number;
  assignedUserIds: number[];
  questions: EditQuestion[];
  hasSubmittedAttempts: boolean;
};

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function TestsPage() {
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const isParent = role === "parent" || role === "superadmin";
  const [tab, setTab] = useState<"all" | "open" | "completed" | "inactive">("all");
  const [search, setSearch] = useState("");
  const [analyticsFrom, setAnalyticsFrom] = useState(() => isoDate(29));
  const [analyticsTo, setAnalyticsTo] = useState(() => isoDate(0));
  const { data, isLoading, error } = useTests(familyId, { status: "all", search });
  const membersQuery = useFamilyMembers(familyId);
  const childMembers = useMemo(
    () => (membersQuery.data ?? []).filter((member) => member.role === "child"),
    [membersQuery.data],
  );
  const analyticsQuery = useTestAnalytics(familyId, {
    from: analyticsFrom,
    to: analyticsTo,
    enabled: isParent,
  });

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

  const analyticsPoints = useMemo(
    () =>
      (analyticsQuery.data?.points ?? []).map((point) => ({
        ...point,
        label: new Date(`${point.date}T00:00:00Z`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      })),
    [analyticsQuery.data?.points],
  );

  if (!familyId) {
    return (
      <div className="py-10 text-sm text-muted-foreground">
        Select a family first to view video quizzes.
      </div>
    );
  }

  if (isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">Loading video quizzes...</div>;
  }

  if (error) {
    return <div className="py-10 text-sm text-destructive">Failed to load video quizzes.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl">{isParent ? "Video Quizzes" : "My Video Quizzes"}</h1>
        {isParent && (
          <Link
            to="/tests/new"
            className="rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase px-5 py-3 shadow-pop-sm inline-flex items-center gap-2"
          >
            <Plus className="size-5" strokeWidth={3} /> New Video Quiz
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

      {isParent && (
        <div className="rounded-2xl border-2 border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-display font-extrabold text-lg">Quiz Performance Over Time</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={analyticsFrom}
                onChange={(e) => setAnalyticsFrom(e.target.value)}
                className="rounded-lg border-2 border-border bg-background px-3 py-1.5 text-xs font-bold"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={analyticsTo}
                onChange={(e) => setAnalyticsTo(e.target.value)}
                className="rounded-lg border-2 border-border bg-background px-3 py-1.5 text-xs font-bold"
              />
            </div>
          </div>

          {analyticsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading analytics...</p>
          ) : analyticsQuery.error ? (
            <p className="text-sm text-destructive">Failed to load analytics.</p>
          ) : (
            <>
              <div className="grid sm:grid-cols-4 gap-3">
                <MetricCard
                  label="Attempts"
                  value={String(analyticsQuery.data?.summary.totalAttempts ?? 0)}
                />
                <MetricCard
                  label="Avg Accuracy"
                  value={`${(analyticsQuery.data?.summary.averageAccuracyPct ?? 0).toFixed(2)}%`}
                />
                <MetricCard
                  label="Avg Min/Question"
                  value={(analyticsQuery.data?.summary.averageMinutesPerQuestion ?? 0).toFixed(2)}
                />
                <MetricCard
                  label="Total XP Earned"
                  value={formatXp(analyticsQuery.data?.summary.totalXpEarned ?? 0)}
                />
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analyticsPoints} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#d7dee6" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="left"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      width={36}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      width={36}
                    />
                    <Tooltip />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="attempts"
                      name="Attempts"
                      stroke="#0ea5e9"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="averageAccuracyPct"
                      name="Avg Accuracy %"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="averageMinutesPerQuestion"
                      name="Avg Min/Question"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search video quizzes..."
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
          <TestCard
            key={test.id}
            test={test}
            familyId={familyId}
            isParent={isParent}
            childMembers={childMembers.map((member) => ({
              userId: member.userId,
              username: member.username,
            }))}
          />
        ))}
      </div>

      {tests.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-3">No video quizzes yet.</div>
          <p className="font-bold">Create one from a YouTube video to get started.</p>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-border bg-background p-3">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display font-extrabold text-xl mt-1">{value}</p>
    </div>
  );
}

function TestCard({
  test,
  familyId,
  isParent,
  childMembers,
}: {
  test: TestListItem;
  familyId: number;
  isParent: boolean;
  childMembers: Array<{ userId: number; username: string }>;
}) {
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

  const reopenMutation = useRequestReopen(familyId, test.id);
  const availabilityMutation = useUpdateTestAvailability(familyId, test.id);
  const deleteMutation = useDeleteTest(familyId, test.id);
  const editQuery = useTestForEdit(familyId, test.id, editOpen);
  const updateMutation = useUpdateTest(familyId, test.id);
  const reopenRequestsQuery = useReopenRequests(
    familyId,
    test.id,
    isParent && test.reopenPendingCount > 0,
  );
  const resolveReopenMutation = useResolveReopenRequest(familyId, test.id);
  const isInactive = test.availabilityStatus === "inactive";

  useEffect(() => {
    if (!editQuery.data) return;
    setEditForm({
      title: editQuery.data.title,
      difficulty: editQuery.data.difficulty,
      timeLimitMin: editQuery.data.timeLimitMin,
      maxXp: editQuery.data.maxXp,
      assignedUserIds: editQuery.data.assignedUserIds,
      questions: editQuery.data.questions.map((question, idx) => ({
        id: idx + 1,
        questionText: question.questionText,
        options: [question.options[0], question.options[1], question.options[2], question.options[3]],
        correctOption: question.correctOption,
      })),
      hasSubmittedAttempts: editQuery.data.hasSubmittedAttempts,
    });
  }, [editQuery.data]);

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
            ? `Reopen approved (XP delta ${formatXp(result.xpDelta)}).`
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
        message: isInactive ? "Video quiz is now open for children." : "Video quiz is now inactive.",
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
        message: "Video quiz deleted successfully.",
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

  const saveEdit = async () => {
    if (!editForm) return;
    setEditError(null);

    if (!editForm.title.trim()) {
      setEditError("Title is required.");
      return;
    }
    if (editForm.timeLimitMin < 1 || editForm.timeLimitMin > 180) {
      setEditError("Time limit must be between 1 and 180 minutes.");
      return;
    }
    if (editForm.maxXp < 1) {
      setEditError("Max XP must be at least 1.");
      return;
    }
    if (editForm.assignedUserIds.length === 0) {
      setEditError("Assign at least one child.");
      return;
    }
    if (editForm.questions.length < 3 || editForm.questions.length > 30) {
      setEditError("Question count must be between 3 and 30.");
      return;
    }
    for (const question of editForm.questions) {
      if (!question.questionText.trim()) {
        setEditError("Each question must have text.");
        return;
      }
      if (question.options.some((option) => !option.trim())) {
        setEditError("Each question must have 4 non-empty options.");
        return;
      }
      if (question.correctOption < 0 || question.correctOption > 3) {
        setEditError("Each question must select a valid correct option.");
        return;
      }
    }

    try {
      await updateMutation.mutateAsync({
        title: editForm.title.trim(),
        difficulty: editForm.difficulty,
        timeLimitMin: editForm.timeLimitMin,
        maxXp: editForm.maxXp,
        questionCount: editForm.questions.length,
        assignedUserIds: editForm.assignedUserIds,
        questions: editForm.questions.map((question) => ({
          questionText: question.questionText,
          options: question.options,
          correctOption: question.correctOption,
          explanation: null,
        })),
      });
      setEditOpen(false);
      setActionResult({
        title: "Updated",
        message: "Video quiz updated successfully.",
        variant: "success",
      });
    } catch (err) {
      setEditError((err as Error).message);
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
              <span className="text-sm font-extrabold text-warning">
                +{formatXp(test.maxXp)} XP
              </span>
              {isParent ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditError(null);
                      setEditOpen(true);
                    }}
                    className="rounded-xl bg-info/15 text-info font-display font-extrabold uppercase text-xs px-3 py-2 inline-flex items-center gap-1"
                  >
                    <Edit3 className="size-3.5" />
                    Edit
                  </button>
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
                      {isInactive ? "Inactive" : "Start Video Quiz"}
                    </Link>
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto rounded-2xl border-2 border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-display font-extrabold">Edit Video Quiz</DialogTitle>
          </DialogHeader>
          {editQuery.isLoading || !editForm ? (
            <p className="text-sm text-muted-foreground">Loading quiz editor...</p>
          ) : (
            <div className="space-y-4">
              {editForm.hasSubmittedAttempts && (
                <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-bold text-warning">
                  Question edits are locked because this quiz already has submitted attempts. You can
                  still update metadata and assignments.
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Title">
                  <input
                    value={editForm.title}
                    onChange={(e) => setEditForm((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Difficulty">
                  <select
                    value={editForm.difficulty}
                    onChange={(e) =>
                      setEditForm((prev) =>
                        prev ? { ...prev, difficulty: e.target.value as TestDifficulty } : prev,
                      )
                    }
                    className={inputCls}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard (Tricky)</option>
                  </select>
                </Field>
                <Field label="Time Limit (min)">
                  <input
                    type="number"
                    value={editForm.timeLimitMin}
                    min={1}
                    max={180}
                    onChange={(e) =>
                      setEditForm((prev) =>
                        prev ? { ...prev, timeLimitMin: Number(e.target.value) || 0 } : prev,
                      )
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Max XP">
                  <input
                    type="number"
                    value={editForm.maxXp}
                    min={1}
                    onChange={(e) =>
                      setEditForm((prev) =>
                        prev ? { ...prev, maxXp: Number(e.target.value) || 0 } : prev,
                      )
                    }
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Assigned Children">
                <div className="grid sm:grid-cols-3 gap-2">
                  {childMembers.map((child) => (
                    <label
                      key={child.userId}
                      className="flex items-center gap-2 rounded-xl border-2 border-border px-3 py-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={editForm.assignedUserIds.includes(child.userId)}
                        onChange={() =>
                          setEditForm((prev) => {
                            if (!prev) return prev;
                            const exists = prev.assignedUserIds.includes(child.userId);
                            return {
                              ...prev,
                              assignedUserIds: exists
                                ? prev.assignedUserIds.filter((id) => id !== child.userId)
                                : [...prev.assignedUserIds, child.userId],
                            };
                          })
                        }
                        className="size-4 accent-primary"
                      />
                      <span className="font-bold text-sm">{child.username}</span>
                    </label>
                  ))}
                </div>
              </Field>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-extrabold text-sm uppercase tracking-wide">
                    Questions ({editForm.questions.length})
                  </h4>
                  {!editForm.hasSubmittedAttempts && (
                    <button
                      onClick={() =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                questions: [
                                  ...prev.questions,
                                  {
                                    id: Date.now(),
                                    questionText: "",
                                    options: ["", "", "", ""],
                                    correctOption: 0,
                                  },
                                ],
                              }
                            : prev,
                        )
                      }
                      className="rounded-lg bg-info/15 text-info text-xs font-extrabold uppercase px-3 py-1.5"
                    >
                      Add Question
                    </button>
                  )}
                </div>
                {editForm.questions.map((question, questionIndex) => (
                  <div key={question.id} className="rounded-xl border-2 border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase text-muted-foreground">
                        Question {questionIndex + 1}
                      </span>
                      {!editForm.hasSubmittedAttempts && (
                        <button
                          onClick={() =>
                            setEditForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    questions: prev.questions.filter((item) => item.id !== question.id),
                                  }
                                : prev,
                            )
                          }
                          className="text-destructive text-xs font-extrabold uppercase"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <input
                      value={question.questionText}
                      disabled={editForm.hasSubmittedAttempts}
                      onChange={(e) =>
                        setEditForm((prev) => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            questions: prev.questions.map((item) =>
                              item.id === question.id ? { ...item, questionText: e.target.value } : item,
                            ),
                          };
                        })
                      }
                      className={inputCls}
                    />
                    <div className="grid sm:grid-cols-2 gap-2">
                      {question.options.map((option, optionIndex) => (
                        <label
                          key={optionIndex}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border-2 px-2 py-2",
                            question.correctOption === optionIndex
                              ? "border-primary bg-primary/10"
                              : "border-border",
                          )}
                        >
                          <input
                            type="radio"
                            name={`edit-q-${question.id}`}
                            disabled={editForm.hasSubmittedAttempts}
                            checked={question.correctOption === optionIndex}
                            onChange={() =>
                              setEditForm((prev) => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  questions: prev.questions.map((item) =>
                                    item.id === question.id ? { ...item, correctOption: optionIndex } : item,
                                  ),
                                };
                              })
                            }
                            className="accent-primary"
                          />
                          <input
                            value={option}
                            disabled={editForm.hasSubmittedAttempts}
                            onChange={(e) =>
                              setEditForm((prev) => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  questions: prev.questions.map((item) => {
                                    if (item.id !== question.id) return item;
                                    const nextOptions = [...item.options] as [
                                      string,
                                      string,
                                      string,
                                      string,
                                    ];
                                    nextOptions[optionIndex] = e.target.value;
                                    return { ...item, options: nextOptions };
                                  }),
                                };
                              })
                            }
                            className="flex-1 bg-transparent text-sm font-bold focus:outline-none"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {editError && <p className="text-sm text-destructive">{editError}</p>}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditOpen(false)}
                  className="rounded-xl border-2 border-border px-4 py-2 text-xs font-extrabold uppercase"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={updateMutation.isPending}
                  className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-extrabold uppercase disabled:opacity-60"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

const inputCls =
  "w-full rounded-xl border-2 border-border bg-background px-3 py-2 font-bold focus:outline-none focus:border-info disabled:opacity-70";

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
