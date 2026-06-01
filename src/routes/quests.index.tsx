import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuthStore, useFamilyStore } from "@/store";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpandableText } from "@/components/expandable-text";
import { ActionResultModal, type ActionResultVariant } from "@/components/action-result-modal";
import {
  useCompleteQuest,
  useQuests,
  useResolveQuestCompletion,
  type QuestItem,
} from "@/hooks/use-quests";
import { getQuestCategoryLabel } from "@/lib/quest-categories";

export const Route = createFileRoute("/quests/")({ component: QuestsPage });

const CATEGORY_COLORS: Record<string, string> = {
  learning: "bg-primary/15 text-primary-dark",
  chore: "bg-warning/15 text-warning",
  habit: "bg-info/15 text-info",
  fitness: "bg-success/15 text-success-foreground",
  creative: "bg-purple/15 text-purple",
  social: "bg-pink/15 text-pink",
  custom: "bg-secondary text-secondary-foreground",
};

type QuestStatus = "pending" | "pending_approval" | "completed" | "missed";
type QuestTab = "all" | QuestStatus;

type ParentApprovalItem = {
  questId: number;
  questTitle: string;
  assignmentId: number;
  userId: number;
  username: string;
  cycleIndex: number;
  completionRequestedAt: string | null;
  xpReward: number;
};

type ActionResult = {
  title: string;
  message: string;
  variant: ActionResultVariant;
};

const STATUS_BADGE_STYLES: Record<QuestStatus, string> = {
  pending: "bg-warning/20 text-warning",
  pending_approval: "bg-info/20 text-info",
  completed: "bg-success/20 text-success",
  missed: "bg-destructive/15 text-destructive",
};

const TAB_ACTIVE_STYLES: Record<QuestTab, string> = {
  all: "border-primary text-primary-dark",
  pending: "border-warning text-warning",
  pending_approval: "border-info text-info",
  completed: "border-success text-success",
  missed: "border-destructive text-destructive",
};

function getStatusLabel(status: QuestStatus, isParent: boolean): string {
  if (status === "pending") return isParent ? "Not Yet Done" : "In Progress";
  if (status === "pending_approval") return "Reviewing";
  if (status === "completed") return "Completed";
  return isParent ? "Overdue" : "Missed";
}

function getTabLabel(tab: QuestTab, isParent: boolean): string {
  if (tab === "all") return "All";
  if (tab === "pending") return "In Progress";
  if (tab === "pending_approval") return isParent ? "Needs Review" : "Submitted";
  if (tab === "completed") return isParent ? "Completed" : "Done";
  return isParent ? "Overdue" : "Missed";
}

function getTabEmptyMessage(tab: QuestTab, isParent: boolean): string {
  if (isParent) {
    if (tab === "all") return "No quests created yet.";
    if (tab === "pending") return "All quests have been resolved.";
    if (tab === "pending_approval") return "Nothing waiting for your review right now.";
    if (tab === "completed") return "No completed quests yet.";
    return "No overdue quests — nice work! ✅";
  }

  if (tab === "all") return "No quests assigned yet. Check back soon! 🦕";
  if (tab === "pending") return "You're all caught up! 🎉";
  if (tab === "pending_approval") return "Nothing submitted yet. Keep going!";
  if (tab === "completed") return "Complete a quest to see it here! 💪";
  return "Great job — nothing missed! 🦕";
}

function formatRelativeSubmittedTime(iso: string | null): string {
  if (!iso) return "Submitted just now";
  const submittedAt = new Date(iso).getTime();
  if (Number.isNaN(submittedAt)) return "Submitted just now";

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - submittedAt) / 1000));
  if (deltaSeconds < 60) return "Submitted just now";

  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `Submitted ${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Submitted ${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `Submitted ${days} day${days === 1 ? "" : "s"} ago`;
}

function QuestsPage() {
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const isParent = role === "parent" || role === "superadmin";
  const [tab, setTab] = useState<QuestTab>("all");
  const [search, setSearch] = useState("");
  const [queueResult, setQueueResult] = useState<ActionResult | null>(null);

  const visibleTabs: QuestTab[] = isParent
    ? ["all", "pending", "pending_approval", "completed", "missed"]
    : ["all", "pending", "completed", "missed"];

  const resolveCompletion = useResolveQuestCompletion(familyId);
  const { data, isLoading, error } = useQuests(familyId, { search, status: tab });
  const pendingApprovalQuery = useQuests(familyId, { status: "pending_approval" });
  const quests = data?.items ?? [];

  const pendingApprovals = useMemo<ParentApprovalItem[]>(() => {
    if (!isParent) return [];
    const items: ParentApprovalItem[] = [];
    const queueSource = pendingApprovalQuery.data?.items ?? [];
    for (const quest of queueSource) {
      for (const member of quest.assignedMembers) {
        if (member.status === "pending_approval") {
          items.push({
            questId: quest.id,
            questTitle: quest.title,
            assignmentId: member.assignmentId,
            userId: member.userId,
            username: member.username,
            cycleIndex: member.cycleIndex,
            completionRequestedAt: member.completionRequestedAt,
            xpReward: quest.xpReward,
          });
        }
      }
    }
    return items;
  }, [isParent, pendingApprovalQuery.data?.items]);

  const handleResolve = async (item: ParentApprovalItem, decision: "approve" | "reject") => {
    setQueueResult(null);
    try {
      const result = await resolveCompletion.mutateAsync({
        assignmentId: item.assignmentId,
        decision,
      });
      if (decision === "approve") {
        setQueueResult({
          title: "Approved",
          message: `✅ Approved! ${item.username} earned ${result.xpAwarded} XP!`,
          variant: "success",
        });
      } else {
        setQueueResult({
          title: "Sent Back",
          message: `🔄 Sent back to ${item.username}.`,
          variant: "warning",
        });
      }
    } catch (err) {
      setQueueResult({
        title: "Action Failed",
        message: (err as Error).message,
        variant: "error",
      });
    }
  };

  if (!familyId) {
    return (
      <div className="py-10 text-sm text-muted-foreground">
        Select a family first to view quests.
      </div>
    );
  }

  if (isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">Loading quests...</div>;
  }

  if (error) {
    return <div className="py-10 text-sm text-destructive">Failed to load quests.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl">Quests</h1>
        {isParent && (
          <Link
            to="/quests/new"
            className="rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase px-5 py-3 btn-pop inline-flex items-center gap-2"
          >
            <Plus className="size-5" strokeWidth={3} /> New Quest
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quests..."
            className="w-full rounded-2xl border-2 border-border bg-card pl-10 pr-4 py-2.5 font-bold text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="flex gap-2 border-b-2 border-border flex-wrap">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2.5 font-display font-extrabold uppercase text-sm tracking-wide border-b-4 -mb-0.5 transition-colors",
              tab === t
                ? TAB_ACTIVE_STYLES[t]
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {getTabLabel(t, isParent)}
          </button>
        ))}
      </div>

      {isParent && (
        <div className="rounded-2xl bg-card border-2 border-border p-4 space-y-3">
          <h3 className="font-display font-extrabold">🔔 Waiting for Your Review</h3>
          {pendingApprovals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing waiting for your review right now.
            </p>
          ) : (
            <div className="space-y-2">
              {pendingApprovals.map((item) => (
                <div
                  key={item.assignmentId}
                  className="rounded-xl border-2 border-border p-3 flex items-center gap-3 flex-wrap"
                >
                  <div className="flex-1 min-w-[220px]">
                    <p className="font-bold text-sm">{item.questTitle}</p>
                    <p className="text-xs text-muted-foreground">{item.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeSubmittedTime(item.completionRequestedAt)}
                    </p>
                    <p className="text-xs font-extrabold text-warning">🌟 {item.xpReward} XP</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResolve(item, "approve")}
                      disabled={resolveCompletion.isPending}
                      className="rounded-lg bg-primary text-primary-foreground text-xs font-extrabold uppercase px-3 py-2"
                    >
                      👍 Approve & Award XP
                    </button>
                    <button
                      onClick={() => handleResolve(item, "reject")}
                      disabled={resolveCompletion.isPending}
                      className="rounded-lg bg-warning/20 text-warning text-xs font-extrabold uppercase px-3 py-2"
                    >
                      🔄 Send Back
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {quests.map((q) => (
          <QuestCard
            key={q.id}
            quest={q}
            currentUserId={currentUserId}
            isParent={isParent}
            familyId={familyId}
          />
        ))}
      </div>

      {quests.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-3">🦕</div>
          <p className="font-bold">{getTabEmptyMessage(tab, isParent)}</p>
        </div>
      )}
      <ActionResultModal
        open={!!queueResult}
        title={queueResult?.title ?? ""}
        message={queueResult?.message ?? ""}
        variant={queueResult?.variant}
        onClose={() => setQueueResult(null)}
      />
    </div>
  );
}

function QuestCard({
  quest,
  currentUserId,
  isParent,
  familyId,
}: {
  quest: QuestItem;
  currentUserId: number | null;
  isParent: boolean;
  familyId: number;
}) {
  const myAssignment = quest.assignedMembers.find((m) => m.userId === currentUserId) ?? null;
  const completeMutation = useCompleteQuest(familyId, myAssignment?.assignmentId ?? null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);

  const onMarkComplete = async () => {
    setActionResult(null);
    try {
      await completeMutation.mutateAsync();
      setActionResult({
        title: "Submitted",
        message: "Submitted! Waiting for a parent to review. 📬",
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

  const statusBadge = (myAssignment?.status ?? quest.status) as QuestStatus;
  const childActionDisabled =
    !myAssignment || completeMutation.isPending || myAssignment.status !== "pending";

  return (
    <div className="rounded-2xl bg-card border-2 border-border p-5 card-pop flex flex-col">
      <Link to="/quests/$questId" params={{ questId: String(quest.id) }} className="block mb-3">
        <div className="aspect-square rounded-2xl bg-gradient-to-br from-primary-light to-info/30 grid place-items-center text-7xl overflow-hidden">
          {quest.thumbnailUrl ? (
            <img src={quest.thumbnailUrl} alt={quest.title} className="size-full object-cover" />
          ) : (
            "🦖"
          )}
        </div>
      </Link>

      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={cn(
            "text-xs font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-md",
            CATEGORY_COLORS[quest.category.trim().toLowerCase()] ??
              "bg-secondary text-secondary-foreground",
          )}
        >
          {getQuestCategoryLabel(quest.category)}
        </span>
        {quest.frequency !== "once" && (
          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
            {quest.frequency}
          </span>
        )}
      </div>

      <Link to="/quests/$questId" params={{ questId: String(quest.id) }} className="block">
        <h3 className="font-display font-extrabold text-lg leading-tight mb-1 hover:underline">
          {quest.title}
        </h3>
      </Link>

      <div className="flex-1">
        <ExpandableText
          text={quest.description || "No description."}
          maxLines={2}
          className="text-sm text-muted-foreground leading-relaxed break-words"
          buttonClassName="mt-1 inline-flex text-[10px] font-display font-extrabold uppercase tracking-wide text-primary hover:underline"
        />
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border gap-2">
        <span className="text-sm font-extrabold text-warning">+{quest.xpReward} XP</span>
        {isParent ? (
          <span
            className={cn(
              "text-[10px] font-extrabold uppercase px-2 py-1 rounded",
              STATUS_BADGE_STYLES[statusBadge],
            )}
            aria-label={`Status: ${getStatusLabel(statusBadge, true)}`}
          >
            {getStatusLabel(statusBadge, true)}
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-[10px] font-extrabold uppercase px-2 py-1 rounded",
                STATUS_BADGE_STYLES[statusBadge],
              )}
              aria-label={`Status: ${getStatusLabel(statusBadge, false)}`}
            >
              {getStatusLabel(statusBadge, false)}
            </span>
            <button
              onClick={onMarkComplete}
              disabled={childActionDisabled}
              aria-disabled={childActionDisabled}
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
              className={cn(
                "rounded-xl font-display font-extrabold uppercase text-xs px-4 py-2.5",
                myAssignment?.status === "pending"
                  ? "bg-primary text-primary-foreground btn-pop"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {completeMutation.isPending ? "Requesting..." : "✅ I'm Done!"}
            </button>
          </div>
        )}
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
