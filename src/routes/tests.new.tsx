import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { useFamilyStore } from "@/store";
import { useFamilyMembers } from "@/hooks/use-families";
import {
  useGeneratePreviewQuestions,
  useRegeneratePreviewQuestion,
  usePreviewSubtitle,
  usePublishTest,
  type TestDifficulty,
  type TestSubtitlePreview,
} from "@/hooks/use-tests";

export const Route = createFileRoute("/tests/new")({ component: NewTestWizard });

type EditorQuestion = {
  id: number;
  text: string;
  options: [string, string, string, string];
  correct: number;
};

function NewTestWizard() {
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [subtitlePreview, setSubtitlePreview] = useState<TestSubtitlePreview | null>(null);
  const [title, setTitle] = useState("");
  const [timeLimitMin, setTimeLimitMin] = useState(30);
  const [maxXp, setMaxXp] = useState(100);
  const [difficulty, setDifficulty] = useState<TestDifficulty>("medium");
  const [assignedUserIds, setAssignedUserIds] = useState<number[]>([]);
  const [questions, setQuestions] = useState<EditorQuestion[]>([]);
  const [regeneratingQuestionId, setRegeneratingQuestionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subtitleNotice, setSubtitleNotice] = useState<string | null>(null);

  const membersQuery = useFamilyMembers(familyId);
  const subtitleMutation = usePreviewSubtitle(familyId);
  const generateQuestionsMutation = useGeneratePreviewQuestions(familyId);
  const regenerateMutation = useRegeneratePreviewQuestion(familyId);
  const publishMutation = usePublishTest(familyId);
  const childMembers = (membersQuery.data ?? []).filter((m) => m.role === "child");

  useEffect(() => {
    if (!subtitlePreview) return;
    if (assignedUserIds.length > 0) return;
    setAssignedUserIds(childMembers.map((m) => m.userId));
  }, [subtitlePreview, assignedUserIds.length, childMembers]);

  if (!familyId) {
    return <div className="py-10 text-sm text-muted-foreground">Select a family first.</div>;
  }

  if (role !== "parent") {
    return <div className="py-10 text-sm text-destructive">Only parents can create video quizzes.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        to="/tests"
        className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="text-3xl">Create a Video Quiz</h1>

      <div className="flex items-center gap-2">
        {([1, 2, 3] as const).map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div
              className={cn(
                "size-9 rounded-full grid place-items-center font-display font-extrabold text-sm",
                s <= step ? "bg-info text-info-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {s}
            </div>
            <span
              className={cn(
                "ml-2 text-sm font-extrabold uppercase tracking-wide",
                s <= step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s === 1 ? "Import" : s === 2 ? "Review" : "Publish"}
            </span>
            {i < 2 && (
              <div
                className={cn("flex-1 h-1 mx-3 rounded-full", s < step ? "bg-info" : "bg-muted")}
              />
            )}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Step1
          loadingSubtitle={subtitleMutation.isPending}
          loadingQuestions={generateQuestionsMutation.isPending}
          subtitle={subtitlePreview}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          error={error}
          subtitleNotice={subtitleNotice}
          onDownloadSubtitle={async (youtubeUrl) => {
            setError(null);
            setSubtitleNotice(null);
            try {
              const subtitle = await subtitleMutation.mutateAsync({ youtubeUrl });
              setSubtitlePreview(subtitle);
              setTitle(subtitle.title);
              setQuestions([]);
              setRegeneratingQuestionId(null);
            } catch (err) {
              const info = subtitleErrorInfo(err);
              setError(info.message);
              setSubtitleNotice(info.notice);
            }
          }}
          onGenerateQuiz={async (youtubeUrl, questionCount) => {
            setError(null);
            setSubtitleNotice(null);
            try {
              let subtitle = subtitlePreview;
              const normalizedInput = youtubeUrl.trim();
              if (!subtitle || subtitle.youtubeUrl.trim() !== normalizedInput) {
                subtitle = await subtitleMutation.mutateAsync({ youtubeUrl });
                setSubtitlePreview(subtitle);
                setTitle(subtitle.title);
              }

              const data = await generateQuestionsMutation.mutateAsync({
                title: subtitle.title,
                rawTranscript: subtitle.rawTranscript,
                questionCount,
                difficulty,
              });
              setQuestions(
                data.questions.map((q, idx) => ({
                  id: idx + 1,
                  text: q.questionText,
                  options: [q.options[0], q.options[1], q.options[2], q.options[3]],
                  correct: q.correctOption,
                })),
              );
              setRegeneratingQuestionId(null);
              setStep(2);
            } catch (err) {
              const info = subtitleErrorInfo(err);
              setError(info.message);
              setSubtitleNotice(info.notice);
            }
          }}
        />
      )}

      {step === 2 && subtitlePreview && (
        <Step2
          subtitle={subtitlePreview}
          title={title}
          questions={questions}
          setQuestions={setQuestions}
          regeneratingQuestionId={regeneratingQuestionId}
          error={error}
          onRegenerate={async (questionId) => {
            const target = questions.find((q) => q.id === questionId);
            if (!target) return;
            setError(null);
            setRegeneratingQuestionId(questionId);
            try {
              const replacement = await regenerateMutation.mutateAsync({
                title: subtitlePreview.title,
                rawTranscript: subtitlePreview.rawTranscript,
                existingQuestions: questions
                  .filter((q) => q.id !== questionId)
                  .map((q) => q.text)
                  .filter((x) => x.trim().length > 0),
                targetQuestionText: target.text,
                difficulty,
              });
              setQuestions((prev) =>
                prev.map((q) =>
                  q.id === questionId
                    ? {
                        ...q,
                        text: replacement.questionText,
                        options: [
                          replacement.options[0],
                          replacement.options[1],
                          replacement.options[2],
                          replacement.options[3],
                        ],
                        correct: replacement.correctOption,
                      }
                    : q,
                ),
              );
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setRegeneratingQuestionId(null);
            }
          }}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && subtitlePreview && (
        <Step3
          title={title}
          difficulty={difficulty}
          timeLimitMin={timeLimitMin}
          setTimeLimitMin={setTimeLimitMin}
          maxXp={maxXp}
          setMaxXp={setMaxXp}
          childMembers={childMembers}
          assignedUserIds={assignedUserIds}
          setAssignedUserIds={setAssignedUserIds}
          error={error}
          loading={publishMutation.isPending}
          onBack={() => setStep(2)}
          onPublish={async () => {
            setError(null);
            if (assignedUserIds.length === 0) {
              setError("Assign at least one child.");
              return;
            }
            try {
              await publishMutation.mutateAsync({
                title: subtitlePreview.title,
                youtubeUrl: subtitlePreview.youtubeUrl,
                videoId: subtitlePreview.videoId,
                thumbnailUrl: subtitlePreview.thumbnailUrl,
                subtitleSource: subtitlePreview.subtitleSource,
                rawTranscript: subtitlePreview.rawTranscript,
                questionCount: questions.length,
                difficulty,
                timeLimitMin,
                maxXp,
                assignedUserIds,
                questions: questions.map((q) => ({
                  questionText: q.text,
                  options: q.options,
                  correctOption: q.correct,
                  explanation: null,
                })),
              });
              nav({ to: "/tests" });
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-info";

function Step1({
  onDownloadSubtitle,
  onGenerateQuiz,
  loadingSubtitle,
  loadingQuestions,
  subtitle,
  difficulty,
  setDifficulty,
  error,
  subtitleNotice,
}: {
  onDownloadSubtitle: (youtubeUrl: string) => Promise<void>;
  onGenerateQuiz: (youtubeUrl: string, questionCount: number) => Promise<void>;
  loadingSubtitle: boolean;
  loadingQuestions: boolean;
  subtitle: TestSubtitlePreview | null;
  difficulty: TestDifficulty;
  setDifficulty: (value: TestDifficulty) => void;
  error: string | null;
  subtitleNotice: string | null;
}) {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  return (
    <div className="rounded-3xl bg-card border-2 border-border p-6 space-y-5">
      <Field label="YouTube URL">
        <input
          className={inputCls}
          placeholder="https://youtube.com/watch?v=..."
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
        />
      </Field>
      <Field label="Number of Questions">
        <input
          type="number"
          value={questionCount}
          min={3}
          max={30}
          onChange={(e) => setQuestionCount(Number(e.target.value))}
          className={inputCls + " max-w-32"}
        />
      </Field>
      <Field label="Difficulty">
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as TestDifficulty)}
          className={inputCls}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard (Tricky)</option>
        </select>
      </Field>
      <button
        onClick={() => onDownloadSubtitle(youtubeUrl)}
        disabled={loadingSubtitle}
        className="w-full rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase py-3.5 shadow-pop-sm inline-flex items-center justify-center gap-2 disabled:opacity-70"
      >
        {loadingSubtitle ? (
          <>
            <Loader2 className="size-5 animate-spin" /> Downloading subtitles...
          </>
        ) : (
          "Download Subtitles"
        )}
      </button>
      {subtitle && (
        <div className="rounded-2xl border-2 border-info/20 bg-info/10 p-4 space-y-2">
          <p className="font-bold text-sm">{subtitle.title}</p>
          <p className="text-xs text-muted-foreground">
            Difficulty: {difficultyLabel(difficulty)} · Source:{" "}
            {subtitleSourceLabel(subtitle.subtitleSource)} ·{" "}
            {subtitle.transcriptWordCount.toLocaleString()} words
          </p>
          <div className="max-h-56 overflow-auto rounded-xl border border-border bg-background/80 p-3 text-xs leading-relaxed">
            {subtitle.rawTranscript}
          </div>
        </div>
      )}
      <button
        onClick={() => onGenerateQuiz(youtubeUrl, questionCount)}
        disabled={loadingQuestions || !subtitle}
        className="w-full rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-3.5 shadow-pop-sm inline-flex items-center justify-center gap-2 disabled:opacity-70"
      >
        {loadingQuestions ? (
          <>
            <Loader2 className="size-5 animate-spin" /> Generating questions...
          </>
        ) : (
          "Generate Quiz"
        )}
      </button>
      {(loadingSubtitle || loadingQuestions) && (
        <p className="text-center text-sm text-muted-foreground">
          {loadingSubtitle ? "Fetching subtitles..." : "Generating questions..."}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {subtitleNotice && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900">
          {subtitleNotice}
        </div>
      )}
    </div>
  );
}

function Step2({
  subtitle,
  title,
  questions,
  setQuestions,
  regeneratingQuestionId,
  error,
  onRegenerate,
  onBack,
  onNext,
}: {
  subtitle: TestSubtitlePreview;
  title: string;
  questions: EditorQuestion[];
  setQuestions: React.Dispatch<React.SetStateAction<EditorQuestion[]>>;
  regeneratingQuestionId: number | null;
  error: string | null;
  onRegenerate: (questionId: number) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-info/10 border-2 border-info/20 p-4 flex items-center justify-between">
        <div>
          <p className="font-bold text-sm">{title || subtitle.title}</p>
          <p className="text-xs text-muted-foreground">
            Transcript: ~{subtitle.transcriptWordCount.toLocaleString()} words · Source:{" "}
            {subtitleSourceLabel(subtitle.subtitleSource)}
          </p>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        <h3 className="font-display font-extrabold">Questions ({questions.length})</h3>
        <button
          onClick={() =>
            setQuestions((prev) => [
              ...prev,
              { id: Date.now(), text: "", options: ["", "", "", ""], correct: 0 },
            ])
          }
          className="text-sm font-bold text-info inline-flex items-center gap-1"
        >
          <Plus className="size-4" /> Add Question
        </button>
      </div>
      {questions.map((q, qi) => (
        <div key={q.id} className="rounded-2xl bg-card border-2 border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-muted-foreground">
              Question {qi + 1}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => void onRegenerate(q.id)}
                disabled={regeneratingQuestionId === q.id}
                className="text-info inline-flex items-center gap-1 text-xs font-bold disabled:opacity-60"
                title="Regenerate this question"
              >
                {regeneratingQuestionId === q.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Regenerate
              </button>
              <button
                onClick={() => setQuestions((prev) => prev.filter((x) => x.id !== q.id))}
                className="text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
          <input
            value={q.text}
            onChange={(e) =>
              setQuestions((prev) =>
                prev.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)),
              )
            }
            className={inputCls}
          />
          <div className="grid sm:grid-cols-2 gap-2">
            {q.options.map((opt, oi) => (
              <label
                key={oi}
                className={cn(
                  "flex items-center gap-2 rounded-xl border-2 px-3 py-2 cursor-pointer",
                  q.correct === oi ? "border-primary bg-primary/10" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name={`q${q.id}`}
                  checked={q.correct === oi}
                  onChange={() =>
                    setQuestions((prev) =>
                      prev.map((x) => (x.id === q.id ? { ...x, correct: oi } : x)),
                    )
                  }
                  className="accent-primary"
                />
                <input
                  value={opt}
                  onChange={(e) =>
                    setQuestions((prev) =>
                      prev.map((x) => {
                        if (x.id !== q.id) return x;
                        const options = [...x.options] as [string, string, string, string];
                        options[oi] = e.target.value;
                        return { ...x, options };
                      }),
                    )
                  }
                  className="flex-1 bg-transparent font-bold text-sm focus:outline-none"
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="rounded-2xl bg-secondary font-display font-extrabold uppercase px-6 py-3"
        >
          <ArrowLeft className="size-4 inline" /> Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase py-3 shadow-pop-sm"
        >
          Next <ArrowRight className="size-4 inline" />
        </button>
      </div>
    </div>
  );
}

function Step3({
  title,
  difficulty,
  timeLimitMin,
  setTimeLimitMin,
  maxXp,
  setMaxXp,
  childMembers,
  assignedUserIds,
  setAssignedUserIds,
  onBack,
  onPublish,
  loading,
  error,
}: {
  title: string;
  difficulty: TestDifficulty;
  timeLimitMin: number;
  setTimeLimitMin: (v: number) => void;
  maxXp: number;
  setMaxXp: (v: number) => void;
  childMembers: Array<{ userId: number; username: string }>;
  assignedUserIds: number[];
  setAssignedUserIds: React.Dispatch<React.SetStateAction<number[]>>;
  onBack: () => void;
  onPublish: () => Promise<void>;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-3xl bg-card border-2 border-border p-6 space-y-5">
      <Field label="Video Quiz Title (From Video)">
        <input className={inputCls} value={title} readOnly />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Difficulty">
          <input className={inputCls} value={difficultyLabel(difficulty)} readOnly />
        </Field>
        <Field label="Time Limit (min)">
          <input
            type="number"
            value={timeLimitMin}
            onChange={(e) => setTimeLimitMin(Number(e.target.value))}
            className={inputCls}
          />
        </Field>
        <Field label="Max XP Reward">
          <input
            type="number"
            value={maxXp}
            onChange={(e) => setMaxXp(Number(e.target.value))}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Assign to">
        <div className="grid grid-cols-3 gap-2">
          {childMembers.map((m) => (
            <label
              key={m.userId}
              className="flex items-center gap-2 rounded-xl border-2 border-border px-3 py-2 cursor-pointer hover:border-info"
            >
              <input
                type="checkbox"
                checked={assignedUserIds.includes(m.userId)}
                onChange={() =>
                  setAssignedUserIds((prev) =>
                    prev.includes(m.userId)
                      ? prev.filter((x) => x !== m.userId)
                      : [...prev, m.userId],
                  )
                }
                className="size-4 accent-primary"
              />
              <span className="font-bold text-sm">{m.username}</span>
            </label>
          ))}
        </div>
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="rounded-2xl bg-secondary font-display font-extrabold uppercase px-6 py-3"
        >
          <ArrowLeft className="size-4 inline" /> Back
        </button>
        <button
          onClick={onPublish}
          disabled={loading}
          className="flex-1 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-3 btn-pop text-center disabled:opacity-60"
        >
          {loading ? "Publishing..." : "Publish Video Quiz"}
        </button>
      </div>
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

function subtitleSourceLabel(source: string): string {
  if (source === "youtube_manual") return "YouTube Manual";
  if (source === "youtube_auto") return "YouTube Auto";
  if (source === "youtube_translated") return "YouTube Translated";
  if (source === "whisper") return "Whisper";
  return "Fallback";
}

function difficultyLabel(value: TestDifficulty): string {
  if (value === "easy") return "Easy";
  if (value === "hard") return "Hard (Tricky)";
  return "Medium";
}

function subtitleErrorInfo(err: unknown): { message: string; notice: string | null } {
  const message = err instanceof Error ? err.message : "Failed to fetch subtitles.";
  if (
    err instanceof ApiError &&
    (err.status === 503 || /network policy|firewall|proxy|cloud-ip/i.test(err.detail))
  ) {
    return {
      message,
      notice:
        "Server could not access YouTube subtitle endpoints. This is often caused by firewall/proxy egress policy or cloud-IP blocking. Ask admin to allow outbound access to youtube.com and video.google.com (HTTPS/443), or configure a rotating proxy for subtitle fetch.",
    };
  }
  return { message, notice: null };
}
