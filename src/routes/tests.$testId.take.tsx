import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFamilyStore } from "@/store";
import {
  useAttemptReview,
  useRequestReopen,
  useStartTest,
  useSubmitTest,
  type TestAttemptStart,
} from "@/hooks/use-tests";

export const Route = createFileRoute("/tests/$testId/take")({ component: TestTakePage });

type Phase = "watch" | "answer" | "results";

type AttemptDraft = {
  attemptId: number;
  answers: Record<number, number>;
  currentIndex: number;
  timeLeftSec: number;
  phase: "watch" | "answer";
  watchComplete: boolean;
  updatedAt: number;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        id: string,
        options: Record<string, unknown>,
      ) => {
        destroy?: () => void;
      };
      PlayerState?: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function TestTakePage() {
  const { testId } = Route.useParams();
  const testIdNum = Number(testId);
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const nav = useNavigate();

  const startMutation = useStartTest(familyId, Number.isFinite(testIdNum) ? testIdNum : null);
  const submitMutation = useSubmitTest(familyId, Number.isFinite(testIdNum) ? testIdNum : null);
  const reopenMutation = useRequestReopen(familyId, Number.isFinite(testIdNum) ? testIdNum : null);

  const [attempt, setAttempt] = useState<TestAttemptStart | null>(null);
  const [phase, setPhase] = useState<Phase>("watch");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeftSec, setTimeLeftSec] = useState<number | null>(null);
  const [watchComplete, setWatchComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedAttemptId, setSubmittedAttemptId] = useState<number | null>(null);
  const [reopenRequested, setReopenRequested] = useState(false);
  const submitLock = useRef(false);

  const reviewQuery = useAttemptReview(
    familyId,
    Number.isFinite(testIdNum) ? testIdNum : null,
    submittedAttemptId,
    phase === "results",
  );

  const storageKey = useMemo(
    () => (familyId ? `dq:test-attempt:${familyId}:${testIdNum}` : ""),
    [familyId, testIdNum],
  );

  const playerContainerId = useMemo(
    () => `yt-player-${attempt?.attemptId ?? "pending"}`,
    [attempt?.attemptId],
  );

  useEffect(() => {
    if (!familyId || role !== "child" || !Number.isFinite(testIdNum)) return;
    let cancelled = false;

    const bootAttempt = async () => {
      try {
        setError(null);
        const started = await startMutation.mutateAsync();
        if (cancelled) return;

        setAttempt(started);
        setSubmittedAttemptId(null);
        setReopenRequested(false);

        if (typeof window !== "undefined" && storageKey) {
          const raw = window.localStorage.getItem(storageKey);
          if (raw) {
            try {
              const draft = JSON.parse(raw) as AttemptDraft;
              if (draft.attemptId === started.attemptId) {
                setAnswers(draft.answers ?? {});
                setCurrentIndex(
                  Math.max(
                    0,
                    Math.min(draft.currentIndex ?? 0, Math.max(started.questions.length - 1, 0)),
                  ),
                );
                setTimeLeftSec(
                  Math.max(
                    0,
                    Math.min(draft.timeLeftSec ?? started.timeLimitSec, started.timeLimitSec),
                  ),
                );
                setWatchComplete(!!draft.watchComplete);
                setPhase(draft.phase === "answer" ? "answer" : "watch");
                return;
              }
            } catch {
              // ignore bad local data
            }
          }
        }

        setAnswers({});
        setCurrentIndex(0);
        setTimeLeftSec(started.timeLimitSec);
        setWatchComplete(false);
        setPhase("watch");
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };

    void bootAttempt();
    return () => {
      cancelled = true;
    };
  }, [familyId, role, testIdNum]);

  useEffect(() => {
    if (!attempt || !storageKey || phase === "results" || !familyId) return;
    if (typeof window === "undefined") return;
    if (timeLeftSec == null) return;

    const payload: AttemptDraft = {
      attemptId: attempt.attemptId,
      answers,
      currentIndex,
      timeLeftSec,
      phase: phase === "answer" ? "answer" : "watch",
      watchComplete,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [attempt, storageKey, phase, answers, currentIndex, timeLeftSec, watchComplete, familyId]);

  useEffect(() => {
    if (phase !== "answer" || timeLeftSec == null) return;
    if (timeLeftSec <= 0) {
      void submitAttempt("timeout");
      return;
    }
    const t = window.setInterval(() => {
      setTimeLeftSec((prev) => (prev == null ? prev : Math.max(0, prev - 1)));
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, timeLeftSec]);

  useEffect(() => {
    if (phase !== "watch" || !attempt) return;

    let cancelled = false;
    let player: { destroy?: () => void } | null = null;

    const initPlayer = () => {
      if (cancelled || !window.YT?.Player) return;
      player = new window.YT.Player(playerContainerId, {
        events: {
          onStateChange: (event: { data: number }) => {
            if (window.YT?.PlayerState && event.data === window.YT.PlayerState.ENDED) {
              setWatchComplete(true);
              setPhase("answer");
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const existing = document.getElementById("youtube-iframe-api");
      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prevReady?.();
        initPlayer();
      };
      if (!existing) {
        const script = document.createElement("script");
        script.id = "youtube-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      player?.destroy?.();
    };
  }, [phase, attempt?.attemptId, playerContainerId]);

  const shuffledOptionsByQuestion = useMemo(() => {
    if (!attempt) return new Map<number, Array<{ text: string; originalIndex: number }>>();
    const seedBase = attempt.attemptId;
    const out = new Map<number, Array<{ text: string; originalIndex: number }>>();
    for (const q of attempt.questions) {
      const opts = q.options.map((text, originalIndex) => ({ text, originalIndex }));
      out.set(q.id, deterministicShuffle(opts, seedBase + q.id));
    }
    return out;
  }, [attempt]);

  const activeQuestion = attempt?.questions[currentIndex] ?? null;
  const totalQuestions = attempt?.questions.length ?? 0;

  const submitAttempt = async (reason: "manual" | "timeout") => {
    if (!attempt || submitLock.current) return;
    submitLock.current = true;
    setError(null);
    try {
      const payloadAnswers = attempt.questions
        .filter((q) => typeof answers[q.id] === "number")
        .map((q) => ({ questionId: q.id, selectedOption: answers[q.id] as number }));

      const res = await submitMutation.mutateAsync({
        attemptId: attempt.attemptId,
        answers: payloadAnswers,
      });
      setSubmittedAttemptId(res.attemptId);
      setPhase("results");
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.removeItem(storageKey);
      }
      if (reason === "timeout") {
        setError("Time is up. Your test was auto-submitted.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      submitLock.current = false;
    }
  };

  const requestRetry = async () => {
    setError(null);
    try {
      await reopenMutation.mutateAsync({ reason: "Need another attempt to improve score" });
      setReopenRequested(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!familyId) {
    return (
      <div className="py-10 text-sm text-muted-foreground">
        Select a family first to take tests.
      </div>
    );
  }

  if (role !== "child") {
    return <div className="py-10 text-sm text-destructive">Only children can take tests.</div>;
  }

  if (startMutation.isPending && !attempt) {
    return (
      <div className="py-16 text-sm text-muted-foreground inline-flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Preparing your test...
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="space-y-4 py-10">
        <p className="text-sm text-destructive">{error ?? "Unable to load this test."}</p>
        <Link to="/tests" className="text-sm font-bold text-info hover:underline">
          Back to Tests
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          to="/tests"
          className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Tests
        </Link>
        {phase === "answer" && (
          <div
            className={cn(
              "rounded-xl border-2 px-3 py-2 text-sm font-extrabold tabular-nums inline-flex items-center gap-2",
              (timeLeftSec ?? 0) < 60
                ? "text-destructive border-destructive/50 bg-destructive/10 animate-pulse"
                : "text-info border-info/30 bg-info/10",
            )}
          >
            <Clock className="size-4" /> {formatClock(timeLeftSec ?? 0)}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-card border-2 border-border p-4">
        <h1 className="text-2xl">{attempt.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {attempt.questionCount} questions • +{attempt.maxXp} XP
        </p>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive inline-flex items-start gap-2">
          <AlertCircle className="size-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {phase === "watch" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-info/10 border-2 border-info/20 p-4 font-bold">
            Step 1: Watch the video carefully before answering questions.
          </div>
          <div className="rounded-2xl overflow-hidden border-2 border-border bg-black aspect-video">
            <iframe
              id={playerContainerId}
              src={`https://www.youtube.com/embed/${attempt.videoId}?enablejsapi=1&rel=0`}
              title={attempt.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">
              {watchComplete
                ? "Video completed. You can move to questions."
                : "If autoplay tracking fails, use the button below to continue."}
            </span>
            <button
              onClick={() => {
                setWatchComplete(true);
                setPhase("answer");
              }}
              className="rounded-xl bg-primary text-primary-foreground font-display font-extrabold uppercase text-xs px-4 py-2 btn-pop"
            >
              I Finished Watching → Go to Questions
            </button>
          </div>
        </div>
      )}

      {phase === "answer" && activeQuestion && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-secondary/60 border-2 border-border p-4">
            <div className="flex items-center justify-between text-sm font-bold">
              <span>
                Question {currentIndex + 1} of {totalQuestions}
              </span>
              <span>{Math.round(((currentIndex + 1) / Math.max(totalQuestions, 1)) * 100)}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-info transition-all"
                style={{ width: `${((currentIndex + 1) / Math.max(totalQuestions, 1)) * 100}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => setPhase("watch")}
            className="text-sm font-bold text-info hover:underline"
          >
            ← Rewatch video
          </button>

          <div className="rounded-2xl bg-card border-2 border-border p-5 space-y-4">
            <h2 className="font-display font-extrabold text-lg leading-snug">
              {activeQuestion.questionOrder}. {activeQuestion.questionText}
            </h2>
            <div className="grid gap-2">
              {(shuffledOptionsByQuestion.get(activeQuestion.id) ?? []).map((opt, idx) => {
                const isSelected = answers[activeQuestion.id] === opt.originalIndex;
                return (
                  <button
                    key={`${activeQuestion.id}-${opt.originalIndex}`}
                    onClick={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        [activeQuestion.id]: opt.originalIndex,
                      }))
                    }
                    className={cn(
                      "rounded-xl border-2 px-4 py-3 text-left font-bold transition-colors",
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-info/40",
                    )}
                  >
                    <span className="text-xs text-muted-foreground mr-2">
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    {opt.text}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              onClick={() => setCurrentIndex((v) => Math.max(0, v - 1))}
              disabled={currentIndex === 0}
              className="rounded-xl bg-secondary font-display font-extrabold uppercase text-xs px-4 py-2 disabled:opacity-50"
            >
              Previous
            </button>
            {currentIndex < totalQuestions - 1 ? (
              <button
                onClick={() => setCurrentIndex((v) => Math.min(totalQuestions - 1, v + 1))}
                className="rounded-xl bg-info text-info-foreground font-display font-extrabold uppercase text-xs px-4 py-2"
              >
                Next <ArrowRight className="size-3 inline" />
              </button>
            ) : (
              <button
                onClick={() => void submitAttempt("manual")}
                disabled={submitMutation.isPending}
                className="rounded-xl bg-primary text-primary-foreground font-display font-extrabold uppercase text-xs px-4 py-2 btn-pop disabled:opacity-70"
              >
                {submitMutation.isPending ? "Submitting..." : "Submit 🎯"}
              </button>
            )}
          </div>
        </div>
      )}

      {phase === "results" && (
        <div className="space-y-4">
          {reviewQuery.isLoading ? (
            <div className="rounded-2xl bg-card border-2 border-border p-6 text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Loading detailed review...
            </div>
          ) : reviewQuery.error || !reviewQuery.data ? (
            <div className="rounded-2xl bg-card border-2 border-border p-6 text-sm text-destructive">
              Failed to load review details.
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-primary/10 border-2 border-primary/30 p-5">
                <h2 className="text-xl">Results</h2>
                <p className="mt-2 font-bold text-lg">
                  {reviewQuery.data.scoreRaw} / {reviewQuery.data.totalQuestions} correct (
                  {reviewQuery.data.scorePct}%)
                </p>
                <p className="text-sm text-warning font-extrabold mt-1">
                  +{reviewQuery.data.xpEarned} XP earned
                </p>
              </div>

              <div className="space-y-3">
                {reviewQuery.data.questions.map((q) => (
                  <div
                    key={q.questionId}
                    className="rounded-2xl bg-card border-2 border-border p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-bold text-sm">
                        {q.questionOrder}. {q.questionText}
                      </p>
                      <span
                        className={cn(
                          "text-xs font-extrabold uppercase px-2 py-1 rounded-md",
                          q.isCorrect
                            ? "bg-primary/15 text-primary-dark"
                            : "bg-destructive/15 text-destructive",
                        )}
                      >
                        {q.isCorrect ? "Correct ✅" : "Incorrect ❌"}
                      </span>
                    </div>
                    <div className="grid gap-2">
                      {q.options.map((opt, idx) => {
                        const isCorrect = idx === q.correctOption;
                        const isSelected = q.selectedOption === idx;
                        return (
                          <div
                            key={idx}
                            className={cn(
                              "rounded-xl border-2 px-3 py-2 text-sm font-bold",
                              isCorrect
                                ? "border-primary/40 bg-primary/10"
                                : isSelected
                                  ? "border-destructive/40 bg-destructive/10"
                                  : "border-border",
                            )}
                          >
                            <span className="text-xs text-muted-foreground mr-2">
                              {String.fromCharCode(65 + idx)}.
                            </span>
                            {opt}
                          </div>
                        );
                      })}
                    </div>
                    {q.explanation && (
                      <div className="rounded-xl bg-info/10 border border-info/20 p-3 text-sm">
                        💡 Explanation: {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2 flex-wrap">
            <button
              onClick={() => nav({ to: "/tests" })}
              className="rounded-xl bg-secondary font-display font-extrabold uppercase text-xs px-4 py-2"
            >
              Done
            </button>
            <button
              onClick={() => void requestRetry()}
              disabled={reopenMutation.isPending || reopenRequested}
              className="rounded-xl bg-info text-info-foreground font-display font-extrabold uppercase text-xs px-4 py-2 disabled:opacity-70"
            >
              {reopenRequested
                ? "Retry Requested"
                : reopenMutation.isPending
                  ? "Sending..."
                  : "Request Retry 🔄"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function deterministicShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = (seed >>> 0) + 0x9e3779b9;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };

  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
