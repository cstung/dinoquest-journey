import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFamilyStore } from "@/store";
import { type QuestFrequency, useCreateQuest } from "@/hooks/use-quests";
import { useFamilyMembers } from "@/hooks/use-families";
import { getQuestCategoryLabel, getQuestCategoryOptionsWithFallback } from "@/lib/quest-categories";

export const Route = createFileRoute("/quests/new")({ component: NewQuest });

function NewQuest() {
  const nav = useNavigate();
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const createQuest = useCreateQuest(familyId);
  const membersQuery = useFamilyMembers(familyId);
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
  const [assignedUserIds, setAssignedUserIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!familyId) {
    return <div className="py-10 text-sm text-muted-foreground">Select a family first.</div>;
  }

  if (role !== "parent" && role !== "superadmin") {
    return <div className="py-10 text-sm text-destructive">Only parents can create quests.</div>;
  }

  const childMembers = (membersQuery.data ?? []).filter((m) => m.role === "child");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (assignedUserIds.length === 0) {
      setError("Please choose at least one child to assign this quest.");
      return;
    }
    if (dueDate && isPastDateInput(dueDate)) {
      setError("Due date cannot be in the past.");
      return;
    }
    try {
      const created = await createQuest.mutateAsync({
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
        assignedUserIds,
      });
      nav({ to: "/quests/$questId", params: { questId: String(created.id) } });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleAssign = (id: number) => {
    setAssignedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        to="/quests"
        className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="text-3xl">Create a Quest</h1>

      <form onSubmit={submit} className="space-y-5 rounded-3xl bg-card border-2 border-border p-6">
        <div className="block">
          <input
            id="quest-thumbnail-input"
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
                setError(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
          <label
            htmlFor="quest-thumbnail-input"
            className={cn(
              "aspect-square rounded-3xl border-2 border-dashed border-border cursor-pointer grid place-items-center text-7xl overflow-hidden",
              "bg-gradient-to-br from-primary-light to-info/30",
            )}
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
          <div className="mt-2 text-xs font-bold text-muted-foreground">
            {thumbnailFileName ?? "Tap to upload quest thumbnail"}
          </div>
        </div>
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="Read for 20 minutes"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={inputCls + " resize-none"}
            placeholder="What needs to be done?"
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Category">
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
          </Field>
          <Field label="Difficulty">
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
          </Field>
          <Field label="XP Reward">
            <input
              type="number"
              value={xpReward}
              min={1}
              onChange={(e) => setXpReward(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label={frequency === "once" ? "Due Date" : "First Due Date"}>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Frequency">
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
          </Field>
          {frequency !== "once" && (
            <Field label="Recurrence End Date (optional)">
              <input
                type="date"
                value={recurrenceEndAt}
                onChange={(e) => setRecurrenceEndAt(e.target.value)}
                className={inputCls}
              />
            </Field>
          )}
        </div>

        <Field label="Assign To Children">
          <div className="grid grid-cols-2 gap-2">
            {childMembers.map((m) => (
              <label
                key={m.userId}
                className="flex items-center gap-2 rounded-xl border-2 border-border px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={assignedUserIds.includes(m.userId)}
                  onChange={() => toggleAssign(m.userId)}
                  className="size-4 rounded-md accent-primary"
                />
                <span className="text-sm font-bold">{m.username}</span>
              </label>
            ))}
            {childMembers.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No children found. Add a child member before creating quests.
              </div>
            )}
          </div>
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button
            disabled={createQuest.isPending}
            type="submit"
            className="flex-1 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-3.5 btn-pop disabled:opacity-60"
          >
            {createQuest.isPending ? "Creating..." : "Create Quest"}
          </button>
          <Link
            to="/quests"
            className="rounded-2xl bg-secondary font-display font-extrabold uppercase px-6 py-3.5 grid place-items-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
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

function dateInputToUtcEndOfDay(value: string): string {
  // VN business-day end (UTC+7) represented in UTC.
  return `${value}T16:59:59.999Z`;
}

function isPastDateInput(value: string): boolean {
  const selected = new Date(value);
  selected.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return selected < today;
}

const inputCls =
  "w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-primary";
const selectCls = `${inputCls} pr-10 disabled:opacity-60`;

function normalizeQuestCategory(value: string): string {
  return value.trim().toLowerCase() || "custom";
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
