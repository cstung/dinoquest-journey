import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useAuthStore, useFamilyStore } from "@/store";
import {
  type QuestFrequency,
  useCompleteQuest,
  useDeleteQuest,
  useQuestDetail,
  useUpdateQuest,
} from "@/hooks/use-quests";
import { ArrowLeft, Calendar, Award, Zap, Repeat, User } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionResultModal, type ActionResultVariant } from "@/components/action-result-modal";
import {
  getQuestCategoryLabel,
  getQuestCategoryOptionsWithFallback,
} from "@/lib/quest-categories";

export const Route = createFileRoute("/quests/$questId")({ component: QuestDetail });

type ActionResult = {
  title: string;
  message: string;
  variant: ActionResultVariant;
};

function QuestDetail() {
  const nav = useNavigate();
  const { questId } = useParams({ from: "/quests/$questId" });
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const questIdNum = Number(questId);
  const query = useQuestDetail(familyId, questIdNum);
  const updateMutation = useUpdateQuest(familyId, questIdNum);
  const deleteMutation = useDeleteQuest(familyId, questIdNum);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("learning");
  const [difficulty, setDifficulty] = useState("Easy");
  const [xpReward, setXpReward] = useState(10);
  const [dueDate, setDueDate] = useState("");
  const [frequency, setFrequency] = useState<QuestFrequency>("once");
  const [recurrenceEndAt, setRecurrenceEndAt] = useState("");
  const quest = query.data;
  const myAssignment =
    quest?.assignedMembers.find((m) => m.userId === currentUserId) ??
    null;
  const completeMutation = useCompleteQuest(familyId, myAssignment?.assignmentId ?? null);

  useEffect(() => {
    if (!quest) return;
    setTitle(quest.title);
    setDescription(quest.description ?? "");
    setCategory(quest.category);
    setDifficulty(quest.difficulty);
    setXpReward(quest.xpReward);
    setDueDate(quest.dueDate ? new Date(quest.dueDate).toISOString().slice(0, 10) : "");
    setFrequency(quest.frequency);
    setRecurrenceEndAt(
      quest.recurrenceEndAt ? new Date(quest.recurrenceEndAt).toISOString().slice(0, 10) : "",
    );
  }, [quest]);

  if (!familyId) {
    return <div className="py-10 text-sm text-muted-foreground">Select a family first.</div>;
  }

  if (query.isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">Loading quest...</div>;
  }

  if (query.error || !query.data) {
    return (
      <div className="text-center py-16">
        <p>Quest not found.</p>
        <Link to="/quests" className="text-primary font-bold">
          Back
        </Link>
      </div>
    );
  }
  const canComplete = role === "child" && quest.status === "pending";
  const canManage = role === "parent" || role === "superadmin";

  const onComplete = async () => {
    setActionResult(null);
    try {
      await completeMutation.mutateAsync();
      setActionResult({
        title: "Pending Approval",
        message: "Completion request sent. Waiting for parent approval.",
        variant: "warning",
      });
      await query.refetch();
    } catch (err) {
      setActionResult({
        title: "Action Failed",
        message: (err as Error).message,
        variant: "error",
      });
    }
  };

  const onSave = async () => {
    setActionResult(null);
    try {
      await updateMutation.mutateAsync({
        title,
        description: description || null,
        category: normalizeQuestCategory(category),
        difficulty,
        xpReward,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        frequency,
        recurrenceEndAt:
          frequency !== "once" && recurrenceEndAt ? new Date(recurrenceEndAt).toISOString() : null,
      });
      await query.refetch();
      setEditMode(false);
      setActionResult({
        title: "Updated",
        message: "Quest updated.",
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

  const onDelete = async () => {
    setActionResult(null);
    try {
      await deleteMutation.mutateAsync();
      nav({ to: "/quests" });
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
        to="/quests"
        className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to Quests
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <span className="inline-block text-xs font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-md bg-primary/15 text-primary-dark">
            {getQuestCategoryLabel(quest.category)}
          </span>
          {editMode ? (
            <div className="rounded-2xl border-2 border-border bg-card p-4 space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 font-bold"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 font-bold"
              />
              <div className="grid sm:grid-cols-2 gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={selectCls}
                >
                  {getQuestCategoryOptionsWithFallback(category).map((value) => (
                    <option key={value} value={value}>
                      {getQuestCategoryLabel(value)}
                    </option>
                  ))}
                </select>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className={selectCls}
                >
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                  <option>Epic</option>
                </select>
                <input
                  type="number"
                  value={xpReward}
                  min={1}
                  onChange={(e) => setXpReward(Number(e.target.value))}
                  className="rounded-xl border-2 border-border bg-background px-3 py-2 font-bold"
                />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-xl border-2 border-border bg-background px-3 py-2 font-bold"
                />
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as QuestFrequency)}
                  className={selectCls}
                >
                  <option value="once">One time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                {frequency !== "once" && (
                  <input
                    type="date"
                    value={recurrenceEndAt}
                    onChange={(e) => setRecurrenceEndAt(e.target.value)}
                    className="rounded-xl border-2 border-border bg-background px-3 py-2 font-bold"
                  />
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onSave}
                  disabled={updateMutation.isPending}
                  className="rounded-xl bg-primary text-primary-foreground text-xs font-extrabold uppercase px-3 py-2"
                >
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="rounded-xl bg-secondary text-xs font-extrabold uppercase px-3 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-4xl">{quest.title}</h1>
              <p className="text-lg text-muted-foreground leading-relaxed">{quest.description}</p>
            </>
          )}

          <div className="aspect-square rounded-3xl bg-gradient-to-br from-primary-light to-info/30 grid place-items-center text-8xl overflow-hidden">
            {quest.thumbnailUrl ? (
              <img src={quest.thumbnailUrl} alt={quest.title} className="size-full object-cover" />
            ) : (
              "🎯"
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-card border-2 border-border p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-warning/15 grid place-items-center text-warning">
                <Zap className="size-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase">XP Reward</div>
                <div className="font-display font-extrabold text-xl">+{quest.xpReward} XP</div>
              </div>
            </div>
            {(myAssignment?.cycleDueAt || quest.dueDate) && (
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-info/15 grid place-items-center text-info">
                  <Calendar className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-muted-foreground uppercase">Due</div>
                  <div className="font-bold">
                    {new Date((myAssignment?.cycleDueAt ?? quest.dueDate) as string).toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-purple/15 grid place-items-center text-purple">
                <Award className="size-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-muted-foreground uppercase">Difficulty</div>
                <div className="font-bold">{quest.difficulty}</div>
              </div>
            </div>
            {quest.frequency !== "once" && (
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-pink/15 grid place-items-center text-pink">
                  <Repeat className="size-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-muted-foreground uppercase">
                    Recurrence
                  </div>
                  <div className="font-bold uppercase">{quest.frequency}</div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card border-2 border-border p-5">
            <h3 className="font-display font-extrabold mb-3 flex items-center gap-2">
              <User className="size-4" />
              Assigned to
            </h3>
            <ul className="space-y-2">
              {quest.assignedMembers.map((m) => (
                <li key={m.userId} className="flex items-center gap-3">
                  <span
                    className="size-8 rounded-xl grid place-items-center text-xs font-extrabold text-white"
                    style={{ backgroundColor: m.avatarColor ?? "#9ca3af" }}
                  >
                    {m.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1 font-bold text-sm">{m.username}</span>
                  <span className="text-xs font-bold text-muted-foreground capitalize">
                    {m.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {canComplete ? (
            <button
              onClick={onComplete}
              disabled={completeMutation.isPending || !myAssignment}
              className="w-full rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-4 btn-pop disabled:opacity-60"
            >
              {completeMutation.isPending ? "Requesting..." : "Mark as Complete"}
            </button>
          ) : (
            <div className="w-full rounded-2xl bg-secondary font-display font-extrabold uppercase py-4 text-center">
              {quest.status === "completed"
                ? "Completed"
                : quest.status === "pending_approval"
                  ? "Pending Approval"
                  : quest.status === "missed"
                    ? "Missed"
                    : "Parent View"}
            </div>
          )}
          {canManage && !editMode && (
            <div className="flex gap-2">
              <button
                onClick={() => setEditMode(true)}
                className="flex-1 rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase py-3"
              >
                Edit
              </button>
              <button
                onClick={onDelete}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-2xl bg-destructive text-destructive-foreground font-display font-extrabold uppercase py-3 disabled:opacity-60"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          )}
        </aside>
      </div>
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

const selectCls = "rounded-xl border-2 border-border bg-background px-3 py-2 pr-10 font-bold disabled:opacity-60";

function normalizeQuestCategory(value: string): string {
  return value.trim().toLowerCase() || "custom";
}


