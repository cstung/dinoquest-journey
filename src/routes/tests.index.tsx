import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Clock, Play, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFamilyStore } from "@/store";
import {
  useReopenRequests,
  useResolveReopenRequest,
  useRequestReopen,
  useStartTest,
  useSubmitTest,
  useTests,
  type TestAttemptStart,
  type TestListItem,
} from "@/hooks/use-tests";

export const Route = createFileRoute("/tests/")({ component: TestsPage });

function TestsPage() {
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const isParent = role === "parent";
  const [tab, setTab] = useState<"all" | "draft" | "published" | "completed">("all");
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useTests(familyId, { status: tab, search });
  const tests = useMemo(() => data?.items ?? [], [data?.items]);
  const reopenCount = useMemo(
    () => tests.reduce((acc, item) => acc + (item.status === "reopen_requested" ? 1 : 0), 0),
    [tests],
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
        {(isParent ? ["all", "draft", "published", "completed"] : ["all", "completed"]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as typeof tab)}
            className={cn(
              "px-4 py-2.5 font-display font-extrabold uppercase text-sm tracking-wide border-b-4 -mb-0.5 whitespace-nowrap transition-colors",
              tab === t
                ? "border-info text-info"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
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
  const [attempt, setAttempt] = useState<TestAttemptStart | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const startMutation = useStartTest(familyId, test.id);
  const submitMutation = useSubmitTest(familyId, test.id);
  const reopenMutation = useRequestReopen(familyId, test.id);
  const reopenRequestsQuery = useReopenRequests(
    familyId,
    test.id,
    isParent && test.reopenPendingCount > 0,
  );
  const resolveReopenMutation = useResolveReopenRequest(familyId, test.id);

  const openAttempt = async () => {
    setMessage(null);
    try {
      const data = await startMutation.mutateAsync();
      const defaultAnswers: Record<number, number> = {};
      for (const q of data.questions) defaultAnswers[q.id] = 0;
      setAnswers(defaultAnswers);
      setAttempt(data);
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const submitAttempt = async () => {
    if (!attempt) return;
    setMessage(null);
    try {
      const result = await submitMutation.mutateAsync({
        attemptId: attempt.attemptId,
        answers: attempt.questions.map((q) => ({
          questionId: q.id,
          selectedOption: answers[q.id] ?? 0,
        })),
      });
      setAttempt(null);
      setMessage(`Submitted: ${result.scorePct}% score, +${result.xpEarned} XP.`);
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const requestReopen = async () => {
    setMessage(null);
    try {
      await reopenMutation.mutateAsync({ reason: "Need another attempt to improve score" });
      setMessage("Reopen request sent to parent.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const resolveReopen = async (requestId: number, decision: "approve" | "reject") => {
    setMessage(null);
    try {
      const result = await resolveReopenMutation.mutateAsync({ requestId, decision });
      setMessage(
        decision === "approve"
          ? `Reopen approved (XP delta ${result.xpDelta}).`
          : "Reopen request rejected.",
      );
    } catch (err) {
      setMessage((err as Error).message);
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
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                Subtitles: {test.subtitleSource === "youtube_auto" ? "YouTube" : "Whisper AI"}
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
                <span className="rounded-xl bg-info/15 text-info font-display font-extrabold uppercase text-xs px-3 py-2">
                  Parent View
                </span>
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
                  ) : (
                    <button
                      onClick={openAttempt}
                      disabled={startMutation.isPending}
                      className="rounded-xl bg-primary text-primary-foreground font-display font-extrabold uppercase text-xs px-3 py-2 btn-pop"
                    >
                      {startMutation.isPending ? "Starting..." : "Start Test"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

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

      {attempt && (
        <div className="rounded-2xl border-2 border-border p-4 bg-background space-y-4">
          <h4 className="font-display font-extrabold text-lg">Attempt: {attempt.title}</h4>
          {attempt.questions.map((q) => (
            <div key={q.id} className="space-y-2">
              <p className="font-bold text-sm">
                {q.questionOrder}. {q.questionText}
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {q.options.map((option, oi) => (
                  <label
                    key={oi}
                    className="flex items-center gap-2 rounded-xl border-2 border-border px-3 py-2"
                  >
                    <input
                      type="radio"
                      name={`attempt-${attempt.attemptId}-q-${q.id}`}
                      checked={answers[q.id] === oi}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: oi }))}
                      className="accent-primary"
                    />
                    <span className="text-sm font-bold">{option}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={() => setAttempt(null)}
              className="rounded-xl bg-secondary font-display font-extrabold uppercase text-xs px-3 py-2"
            >
              Cancel
            </button>
            <button
              onClick={submitAttempt}
              disabled={submitMutation.isPending}
              className="rounded-xl bg-primary text-primary-foreground font-display font-extrabold uppercase text-xs px-3 py-2 btn-pop"
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Test"}
            </button>
          </div>
        </div>
      )}
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
    published: "Published",
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
