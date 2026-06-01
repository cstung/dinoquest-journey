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
import { getQuestCategoryLabel, getQuestCategoryOptionsWithFallback } from "@/lib/quest-categories";
import { formatXp } from "@/lib/utils";

export const Route = createFileRoute("/quests/$questId")({ component: QuestDetail });

type ActionResult = {
  title: string;
  message: string;
  variant: ActionResultVariant;
};

type QuestStatus = "pending" | "pending_approval" | "completed" | "missed";

function getStatusLabel(status: QuestStatus, isParent: boolean): string {
  if (status === "pending") return isParent ? "Not Yet Done" : "In Progress";
  if (status === "pending_approval") return "Reviewing";
  if (status === "completed") return "Completed";
  return isParent ? "Overdue" : "Missed";
}

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
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailFileName, setThumbnailFileName] = useState<string | null>(null);
  const quest = query.data;
  const myAssignment = quest?.assignedMembers.find((m) => m.userId === currentUserId) ?? null;
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
    setThumbnailUrl(quest.thumbnailUrl ?? null);
    setThumbnailFileName(null);
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
  const isParent = role === "parent" || role === "superadmin";
  const canComplete = role === "child" && myAssignment?.status === "pending";
  const canManage = isParent;

  const onComplete = async () => {
    setActionResult(null);
    try {
      await completeMutation.mutateAsync();
      setActionResult({
        title: "Submitted",
        message: "Submitted! Waiting for a parent to review. 📬",
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
    if (!Number.isFinite(xpReward) || xpReward < 1) {
      setActionResult({
        title: "Action Failed",
        message: "XP Reward must be at least 1.",
        variant: "error",
      });
      return;
    }
    try {
      await updateMutation.mutateAsync({
        title,
        description: description || null,
        category: normalizeQuestCategory(category),
        difficulty,
        thumbnailUrl,
        xpReward,
        dueDate: dueDate ? dateInputToUtcEndOfDay(dueDate) : null,
        frequency,
        recurrenceEndAt:
          frequency !== "once" && recurrenceEndAt ? dateInputToUtcEndOfDay(recurrenceEndAt) : null,
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
              <div className="block">
                <input
                  id="quest-thumbnail-edit-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const dataUrl = await fileToDataUrl(file);
                      setThumbnailUrl(dataUrl);
                      setThumbnailFileName(shortenFileName(file.name));
                      setActionResult(null);
                    } catch (err) {
                      setActionResult({
                        title: "Action Failed",
                        message: (err as Error).message,
                        variant: "error",
                      });
                    }
                  }}
                />
                <label
                  htmlFor="quest-thumbnail-edit-input"
                  className="aspect-square max-w-xs rounded-3xl border-2 border-dashed border-border cursor-pointer grid place-items-center text-7xl overflow-hidden bg-gradient-to-br from-primary-light to-info/30"
                >
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt="Quest thumbnail preview"
                      className="size-full object-cover"
                    />
                  ) : (
                    "🎯"
                  )}
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    {thumbnailFileName ?? "Tap to upload quest thumbnail"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setThumbnailUrl(null);
                      setThumbnailFileName(null);
                    }}
                    className="rounded-lg bg-secondary text-xs font-extrabold uppercase px-2 py-1"
                  >
                    Remove
                  </button>
                </div>
              </div>
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
              <p className="text-lg text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                {quest.description}
              </p>
            </>
          )}

          <div className="aspect-square rounded-3xl bg-gradient-to-br from-primary-light to-info/30 grid place-items-center text-8xl overflow-hidden">
            {(editMode ? thumbnailUrl : quest.thumbnailUrl) ? (
              <img
                src={editMode ? (thumbnailUrl ?? "") : (quest.thumbnailUrl ?? "")}
                alt={quest.title}
                className="size-full object-cover"
              />
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
                <div className="font-display font-extrabold text-xl">
                  +{formatXp(quest.xpReward)} XP
                </div>
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
                    {new Date(
                      (myAssignment?.cycleDueAt ?? quest.dueDate) as string,
                    ).toLocaleDateString()}
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
                    {getStatusLabel(m.status as QuestStatus, isParent)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {role === "child" ? (
            <button
              onClick={onComplete}
              disabled={completeMutation.isPending || !myAssignment || !canComplete}
              aria-disabled={completeMutation.isPending || !myAssignment || !canComplete}
              title={
                !myAssignment
                  ? "Quest is not assigned to you"
                  : myAssignment.status === "pending_approval"
                    ? "Already submitted"
                    : myAssignment.status === "completed"
                      ? "Already completed"
                      : myAssignment.status === "missed"
                        ? "Quest is overdue"
                        : completeMutation.isPending
                          ? "Request in progress"
                          : ""
              }
              className="w-full rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-4 btn-pop disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {completeMutation.isPending ? "Requesting..." : "✅ I'm Done!"}
            </button>
          ) : (
            <div className="w-full rounded-2xl bg-secondary font-display font-extrabold uppercase py-4 text-center">
              {getStatusLabel(quest.status as QuestStatus, true)}
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

const selectCls =
  "rounded-xl border-2 border-border bg-background px-3 py-2 pr-10 font-bold disabled:opacity-60";

function normalizeQuestCategory(value: string): string {
  return value.trim().toLowerCase() || "custom";
}

function dateInputToUtcEndOfDay(value: string): string {
  // VN business-day end (UTC+7) represented in UTC.
  return `${value}T16:59:59.999Z`;
}

async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please upload an image file.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Image must be 2MB or smaller.");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read image."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function shortenFileName(name: string): string {
  if (name.length <= 20) {
    return name;
  }
  const lastDot = name.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < name.length - 1;
  const ext = hasExt ? name.slice(lastDot) : "";
  const base = hasExt ? name.slice(0, lastDot) : name;
  return `${base.slice(0, 3)}...${base.slice(-4)}${ext}`;
}
