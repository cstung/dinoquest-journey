import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { cn, formatXp } from "@/lib/utils";
import { ExpandableText } from "@/components/expandable-text";
import { useAuthStore, useFamilyStore } from "@/store";
import { ActionResultModal, type ActionResultVariant } from "@/components/action-result-modal";
import {
  useClaimReward,
  useCreateReward,
  useDeleteReward,
  useResolveRewardClaim,
  useRewardClaims,
  useRewards,
  useUpdateReward,
  type RewardClaimItem,
} from "@/hooks/use-rewards";
import { useLeaderboard } from "@/hooks/use-leaderboard";

export const Route = createFileRoute("/rewards")({ component: RewardsPage });

type ActionResult = {
  title: string;
  message: string;
  variant: ActionResultVariant;
};

function RewardsPage() {
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const isParent = role === "parent" || role === "superadmin";

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newThumbnailUrl, setNewThumbnailUrl] = useState<string | null>(null);
  const [newThumbnailFileName, setNewThumbnailFileName] = useState<string | null>(null);
  const [newCost, setNewCost] = useState(100);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);

  const rewardsQuery = useRewards(familyId, isParent);
  const claimsQuery = useRewardClaims(familyId, isParent ? "pending" : undefined);
  const leaderboardQuery = useLeaderboard(familyId, "family");
  const createReward = useCreateReward(familyId);

  const myEntry = leaderboardQuery.data?.items.find((x) => x.isYou);
  const balance = myEntry?.xp ?? 0;

  if (!familyId) {
    return <div className="py-10 text-sm text-muted-foreground">Select a family first.</div>;
  }

  if (rewardsQuery.isLoading || claimsQuery.isLoading || leaderboardQuery.isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">Loading rewards...</div>;
  }

  if (rewardsQuery.error || claimsQuery.error || leaderboardQuery.error) {
    return <div className="py-10 text-sm text-destructive">Failed to load rewards.</div>;
  }

  const rewards = rewardsQuery.data ?? [];
  const claims = claimsQuery.data ?? [];
  const pendingClaims = claims.filter((claim) => claim.status === "pending");
  const rewardsWithPendingClaims = new Set(pendingClaims.map((claim) => claim.rewardId));
  const pendingClaimRewardIds = new Set(
    claims
      .filter((claim) => claim.status === "pending" && claim.userId === currentUserId)
      .map((claim) => claim.rewardId),
  );

  const create = async () => {
    setActionResult(null);
    try {
      await createReward.mutateAsync({
        title: newTitle,
        description: newDescription || null,
        thumbnailUrl: newThumbnailUrl,
        xpCost: newCost,
      });
      setNewTitle("");
      setNewDescription("");
      setNewThumbnailUrl(null);
      setNewThumbnailFileName(null);
      setNewCost(100);
      setActionResult({
        title: "Created",
        message: "Reward created.",
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl">Reward Shop</h1>
      </div>

      <div className="rounded-2xl bg-gradient-to-r from-warning/20 to-pink/20 border-2 border-warning/20 p-4 flex items-center gap-3">
        <div className="size-12 rounded-2xl bg-warning grid place-items-center text-warning-foreground shadow-pop-sm">
          <Zap className="size-6" />
        </div>
        <div>
          <div className="text-xs font-extrabold uppercase text-muted-foreground">Your balance</div>
          <div className="font-display font-extrabold text-2xl">{formatXp(balance)} XP</div>
        </div>
      </div>

      {isParent && (
        <div className="rounded-2xl border-2 border-border bg-card p-4 grid sm:grid-cols-4 gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Reward title"
            className="rounded-xl border-2 border-border bg-background px-3 py-2 font-bold text-sm focus:outline-none focus:border-primary"
          />
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description"
            className="rounded-xl border-2 border-border bg-background px-3 py-2 font-bold text-sm focus:outline-none focus:border-primary"
          />
          <label className="rounded-xl border-2 border-dashed border-border bg-background px-3 py-2 text-xs font-bold text-muted-foreground grid place-items-center cursor-pointer">
            {newThumbnailFileName ?? "Upload thumbnail"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const dataUrl = await fileToDataUrl(file);
                  setNewThumbnailUrl(dataUrl);
                  setNewThumbnailFileName(shortenFileName(file.name));
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
          </label>
          <input
            type="number"
            value={newCost}
            onChange={(e) => setNewCost(Number(e.target.value))}
            min={1}
            className="rounded-xl border-2 border-border bg-background px-3 py-2 font-bold text-sm focus:outline-none focus:border-primary"
          />
          <button
            onClick={create}
            disabled={createReward.isPending}
            className="rounded-xl bg-pink text-pink-foreground font-display font-extrabold uppercase px-4 py-2 shadow-pop-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Plus className="size-4" /> {createReward.isPending ? "Adding..." : "Add Reward"}
          </button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rewards.map((r) => (
          <RewardCard
            key={r.id}
            reward={r}
            familyId={familyId}
            balance={balance}
            isParent={isParent}
            hasPendingClaim={pendingClaimRewardIds.has(r.id)}
            hasPendingClaimsForReward={rewardsWithPendingClaims.has(r.id)}
          />
        ))}
      </div>

      {isParent && (
        <div className="rounded-2xl border-2 border-border bg-card p-4">
          <h3 className="font-display font-extrabold mb-3">Pending Claims</h3>
          <div className="space-y-2">
            {pendingClaims.map((claim) => (
              <ClaimRow key={claim.id} familyId={familyId} claim={claim} />
            ))}
            {pendingClaims.length === 0 && (
              <p className="text-sm text-muted-foreground">No pending claims.</p>
            )}
          </div>
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

function RewardCard({
  reward,
  familyId,
  balance,
  isParent,
  hasPendingClaim,
  hasPendingClaimsForReward,
}: {
  reward: {
    id: number;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    xpCost: number;
    isActive: boolean;
  };
  familyId: number;
  balance: number;
  isParent: boolean;
  hasPendingClaim: boolean;
  hasPendingClaimsForReward: boolean;
}) {
  const affordable = balance >= reward.xpCost;
  const claim = useClaimReward(familyId, reward.id);
  const updateReward = useUpdateReward(familyId, reward.id);
  const deleteReward = useDeleteReward(familyId, reward.id);
  const [editMode, setEditMode] = useState(false);
  const [title, setTitle] = useState(reward.title);
  const [description, setDescription] = useState(reward.description ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(reward.thumbnailUrl ?? null);
  const [thumbnailFileName, setThumbnailFileName] = useState<string | null>(null);
  const [xpCost, setXpCost] = useState(reward.xpCost);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const displayThumbnail = editMode ? thumbnailUrl : reward.thumbnailUrl;
  const descriptionText = reward.description?.trim() ?? "";

  const onClaim = async () => {
    setActionResult(null);
    try {
      await claim.mutateAsync();
      setActionResult({
        title: "Pending Approval",
        message: "Claim request sent.",
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

  const onSave = async () => {
    setActionResult(null);
    try {
      await updateReward.mutateAsync({
        title,
        description: description || null,
        thumbnailUrl,
        xpCost,
      });
      setEditMode(false);
      setActionResult({
        title: "Updated",
        message: "Reward updated.",
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

  const toggleActive = async () => {
    setActionResult(null);
    try {
      await updateReward.mutateAsync({ isActive: !reward.isActive });
      setActionResult({
        title: "Updated",
        message: reward.isActive ? "Reward deactivated." : "Reward activated.",
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
    const confirmed = window.confirm(`Delete "${reward.title}"? This cannot be undone.`);
    if (!confirmed) return;
    setActionResult(null);
    try {
      await deleteReward.mutateAsync();
      setActionResult({
        title: "Deleted",
        message: "Reward deleted.",
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

  return (
    <div className="rounded-2xl bg-card border-2 border-border p-5 card-pop flex flex-col">
      <div className="aspect-square rounded-2xl bg-gradient-to-br from-pink/20 to-purple/20 grid place-items-center text-7xl mb-3">
        {displayThumbnail ? (
          <img
            src={displayThumbnail}
            alt={reward.title}
            className={cn(
              "size-full object-cover rounded-2xl",
              !reward.isActive && "grayscale saturate-0",
            )}
          />
        ) : (
          "🎁"
        )}
      </div>
      {isParent && editMode ? (
        <div className="space-y-2 mb-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm font-bold"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm font-bold"
          />
          <input
            type="number"
            min={1}
            value={xpCost}
            onChange={(e) => setXpCost(Number(e.target.value))}
            className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm font-bold"
          />
          <label className="rounded-xl border-2 border-dashed border-border bg-background px-3 py-2 text-xs font-bold text-muted-foreground grid place-items-center cursor-pointer">
            {thumbnailFileName ?? "Upload thumbnail"}
            <input
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
          </label>
          <button
            onClick={() => {
              setThumbnailUrl(null);
              setThumbnailFileName(null);
            }}
            className="rounded-lg bg-secondary text-xs font-extrabold uppercase px-2 py-1"
          >
            Remove Thumbnail
          </button>
        </div>
      ) : (
        <>
          <div className="min-h-[3.25rem]">
            <h3 className="font-display font-extrabold text-lg truncate" title={reward.title}>
              {reward.title}
            </h3>
          </div>
          <div className="flex-1 min-h-[3.75rem]">
            <ExpandableText
              text={descriptionText || "No description."}
              maxLines={3}
              className="text-sm text-muted-foreground break-words"
            />
          </div>
        </>
      )}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        <span className="font-display font-extrabold text-warning text-lg">
          {formatXp(reward.xpCost)} XP
        </span>
        {isParent ? (
          <div className="flex gap-2">
            {editMode ? (
              <>
                <button
                  onClick={onSave}
                  disabled={updateReward.isPending}
                  className="rounded-lg bg-primary text-primary-foreground text-xs font-extrabold uppercase px-2 py-1"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="rounded-lg bg-secondary text-xs font-extrabold uppercase px-2 py-1"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditMode(true)}
                  className="rounded-lg bg-secondary text-xs font-extrabold uppercase px-2 py-1"
                >
                  Edit
                </button>
                <button
                  onClick={toggleActive}
                  disabled={
                    updateReward.isPending || (reward.isActive && hasPendingClaimsForReward)
                  }
                  className={cn(
                    "rounded-lg text-xs font-extrabold uppercase px-2 py-1",
                    reward.isActive ? "bg-destructive text-destructive-foreground" : "bg-secondary",
                    reward.isActive && hasPendingClaimsForReward && "opacity-60 cursor-not-allowed",
                  )}
                >
                  {reward.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={onDelete}
                  disabled={deleteReward.isPending || hasPendingClaimsForReward}
                  className={cn(
                    "rounded-lg bg-destructive text-destructive-foreground text-xs font-extrabold uppercase px-2 py-1 inline-flex items-center gap-1",
                    hasPendingClaimsForReward && "opacity-60 cursor-not-allowed",
                  )}
                >
                  <Trash2 className="size-3.5" />
                  {deleteReward.isPending ? "Deleting..." : "Delete"}
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <button
              disabled={!affordable || claim.isPending || hasPendingClaim}
              onClick={onClaim}
              className={cn(
                "rounded-xl font-display font-extrabold uppercase text-xs px-4 py-2.5",
                affordable && !hasPendingClaim
                  ? "bg-primary text-primary-foreground btn-pop"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {claim.isPending
                ? "Sending..."
                : hasPendingClaim
                  ? "Pending"
                  : affordable
                    ? "Claim"
                    : "Not enough"}
            </button>
          </>
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

function ClaimRow({ familyId, claim }: { familyId: number; claim: RewardClaimItem }) {
  const resolve = useResolveRewardClaim(familyId, claim.id);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);

  const decide = async (decision: "approved" | "rejected") => {
    setActionResult(null);
    try {
      await resolve.mutateAsync(decision);
      setActionResult({
        title: decision === "approved" ? "Approved" : "Rejected",
        message: `Claim ${decision}.`,
        variant: decision === "approved" ? "success" : "warning",
      });
    } catch (err) {
      setActionResult({
        title: "Action Failed",
        message: (err as Error).message,
        variant: "error",
      });
    }
  };

  return (
    <div className="rounded-xl border-2 border-border p-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[220px]">
        <p className="font-bold text-sm">
          {claim.username} requested {claim.rewardTitle}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(claim.requestedAt).toLocaleString()}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => decide("approved")}
          disabled={resolve.isPending}
          className="rounded-lg bg-primary text-primary-foreground text-xs font-extrabold uppercase px-3 py-2"
        >
          Approve
        </button>
        <button
          onClick={() => decide("rejected")}
          disabled={resolve.isPending}
          className="rounded-lg bg-secondary text-xs font-extrabold uppercase px-3 py-2"
        >
          Reject
        </button>
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
