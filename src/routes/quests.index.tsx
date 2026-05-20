import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuthStore, useFamilyStore } from "@/store";
import { Plus, Search, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCompleteQuest,
  useQuests,
  useResolveQuestCompletion,
  type AssignedMember,
  type QuestItem,
} from "@/hooks/use-quests";

export const Route = createFileRoute("/quests/")({ component: QuestsPage });

const CATEGORY_COLORS: Record<string, string> = {
  Daily: "bg-info/15 text-info",
  Learning: "bg-primary/15 text-primary-dark",
  Creative: "bg-purple/15 text-purple",
  Epic: "bg-warning/15 text-warning",
};

type ParentApprovalItem = {
  questId: number;
  questTitle: string;
  assignmentId: number;
  userId: number;
  username: string;
  cycleIndex: number;
};

function QuestsPage() {
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const isParent = role === "parent" || role === "superadmin";
  const [tab, setTab] = useState<"all" | "pending" | "pending_approval" | "completed" | "missed">("all");
  const [search, setSearch] = useState("");
  const [queueMessage, setQueueMessage] = useState<string | null>(null);

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
          });
        }
      }
    }
    return items;
  }, [isParent, pendingApprovalQuery.data?.items]);

  const handleResolve = async (item: ParentApprovalItem, decision: "approve" | "reject") => {
    setQueueMessage(null);
    try {
      const result = await resolveCompletion.mutateAsync({ assignmentId: item.assignmentId, decision });
      if (decision === "approve") {
        setQueueMessage(`Approved '${item.questTitle}' (+${result.xpAwarded} XP).`);
      } else {
        setQueueMessage(`Rejected '${item.questTitle}'.`);
      }
    } catch (err) {
      setQueueMessage((err as Error).message);
    }
  };

  if (!familyId) {
    return <div className="py-10 text-sm text-muted-foreground">Select a family first to view quests.</div>;
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
        {(["all", "pending", "pending_approval", "completed", "missed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2.5 font-display font-extrabold uppercase text-sm tracking-wide border-b-4 -mb-0.5 transition-colors",
              tab === t ? "border-primary text-primary-dark" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {isParent && (
        <div className="rounded-2xl bg-card border-2 border-border p-4 space-y-3">
          <h3 className="font-display font-extrabold">Pending Approvals</h3>
          {pendingApprovals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending approvals.</p>
          ) : (
            <div className="space-y-2">
              {pendingApprovals.map((item) => (
                <div key={item.assignmentId} className="rounded-xl border-2 border-border p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <p className="font-bold text-sm">
                      {item.username} requested completion for {item.questTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">Cycle {item.cycleIndex}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResolve(item, "approve")}
                      disabled={resolveCompletion.isPending}
                      className="rounded-lg bg-primary text-primary-foreground text-xs font-extrabold uppercase px-3 py-2"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleResolve(item, "reject")}
                      disabled={resolveCompletion.isPending}
                      className="rounded-lg bg-secondary text-xs font-extrabold uppercase px-3 py-2"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {queueMessage && <p className="text-sm text-muted-foreground">{queueMessage}</p>}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {quests.map((q) => (
          <QuestCard key={q.id} quest={q} currentUserId={currentUserId} isParent={isParent} familyId={familyId} />
        ))}
      </div>

      {quests.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-3">??</div>
          <p className="font-bold">No quests here yet.</p>
        </div>
      )}
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
  const [message, setMessage] = useState<string | null>(null);

  const onMarkComplete = async () => {
    setMessage(null);
    try {
      await completeMutation.mutateAsync();
      setMessage("Completion request sent. Waiting for parent approval.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const statusBadge = myAssignment?.status ?? quest.status;

  return (
    <div className="rounded-2xl bg-card border-2 border-border p-5 card-pop flex flex-col">
      <div className="aspect-square rounded-2xl bg-gradient-to-br from-primary-light to-info/30 grid place-items-center text-7xl mb-3 overflow-hidden">
        {quest.thumbnailUrl ? (
          <img src={quest.thumbnailUrl} alt={quest.title} className="size-full object-cover" />
        ) : (
          "??"
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={cn(
            "text-xs font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-md",
            CATEGORY_COLORS[quest.category] ?? "bg-secondary text-secondary-foreground",
          )}
        >
          {quest.category}
        </span>
        {quest.frequency !== "once" && (
          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
            {quest.frequency}
          </span>
        )}
      </div>

      <Link to="/quests/$questId" params={{ questId: String(quest.id) }} className="block">
        <h3 className="font-display font-extrabold text-lg leading-tight mb-1 hover:underline">{quest.title}</h3>
      </Link>

      <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{quest.description || "No description."}</p>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        <span className="text-sm font-extrabold text-warning">+{quest.xpReward} XP</span>
        {isParent ? (
          <span className={cn(
            "text-[10px] font-extrabold uppercase px-2 py-1 rounded",
            statusBadge === "completed" && "bg-success/15 text-success-foreground",
            statusBadge === "pending_approval" && "bg-warning/20 text-warning-foreground",
            statusBadge === "missed" && "bg-destructive/15 text-destructive",
            statusBadge === "pending" && "bg-secondary text-secondary-foreground",
          )}>
            {statusBadge === "pending_approval" ? "Pending Approval" : statusBadge}
          </span>
        ) : (
          <button
            onClick={onMarkComplete}
            disabled={
              !myAssignment ||
              completeMutation.isPending ||
              myAssignment.status !== "pending"
            }
            className={cn(
              "rounded-xl font-display font-extrabold uppercase text-xs px-4 py-2.5",
              myAssignment?.status === "pending"
                ? "bg-primary text-primary-foreground btn-pop"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {completeMutation.isPending
              ? "Requesting..."
              : myAssignment?.status === "pending_approval"
                ? "Pending Approval"
                : myAssignment?.status === "completed"
                  ? "Completed"
                  : myAssignment?.status === "missed"
                    ? "Missed"
                    : "Mark Complete"}
          </button>
        )}
      </div>
      {!isParent && message && <p className="text-xs text-muted-foreground mt-2">{message}</p>}
      {!isParent && myAssignment?.status === "pending_approval" && !message && (
        <p className="text-xs text-muted-foreground mt-2">Waiting for parent confirmation.</p>
      )}
    </div>
  );
}
