import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFamilyStore } from "@/store";
import {
  useClaimReward,
  useCreateReward,
  useResolveRewardClaim,
  useRewardClaims,
  useRewards,
  useUpdateReward,
  type RewardClaimItem,
} from "@/hooks/use-rewards";
import { useLeaderboard } from "@/hooks/use-leaderboard";

export const Route = createFileRoute("/rewards")({ component: RewardsPage });

function RewardsPage() {
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const isParent = role === "parent";

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newThumbnailUrl, setNewThumbnailUrl] = useState<string | null>(null);
  const [newThumbnailFileName, setNewThumbnailFileName] = useState<string | null>(null);
  const [newCost, setNewCost] = useState(100);
  const [message, setMessage] = useState<string | null>(null);

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
  const pendingClaims = claimsQuery.data ?? [];

  const create = async () => {
    setMessage(null);
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
      setMessage("Reward created.");
    } catch (err) {
      setMessage((err as Error).message);
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
          <div className="font-display font-extrabold text-2xl">{balance.toLocaleString()} XP</div>
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
                  setMessage(null);
                } catch (err) {
                  setMessage((err as Error).message);
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

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rewards.map((r) => (
          <RewardCard
            key={r.id}
            reward={r}
            familyId={familyId}
            balance={balance}
            isParent={isParent}
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
    </div>
  );
}

function RewardCard({
  reward,
  familyId,
  balance,
  isParent,
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
}) {
  const affordable = balance >= reward.xpCost;
  const claim = useClaimReward(familyId, reward.id);
  const updateReward = useUpdateReward(familyId, reward.id);
  const [editMode, setEditMode] = useState(false);
  const [title, setTitle] = useState(reward.title);
  const [description, setDescription] = useState(reward.description ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(reward.thumbnailUrl ?? null);
  const [thumbnailFileName, setThumbnailFileName] = useState<string | null>(null);
  const [xpCost, setXpCost] = useState(reward.xpCost);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const displayThumbnail = editMode ? thumbnailUrl : reward.thumbnailUrl;
  const titleText = reward.title.trim();
  const canExpandTitle = titleText.length > 40;
  const descriptionText = reward.description?.trim() ?? "";
  const canExpandDescription = descriptionText.length > 120;

  const onClaim = async () => {
    setMessage(null);
    try {
      await claim.mutateAsync();
      setMessage("Claim request sent.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const onSave = async () => {
    setMessage(null);
    try {
      await updateReward.mutateAsync({
        title,
        description: description || null,
        thumbnailUrl,
        xpCost,
      });
      setEditMode(false);
      setMessage("Reward updated.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const toggleActive = async () => {
    setMessage(null);
    try {
      await updateReward.mutateAsync({ isActive: !reward.isActive });
      setMessage(reward.isActive ? "Reward deactivated." : "Reward activated.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  return (
    <div className="rounded-2xl bg-card border-2 border-border p-5 card-pop flex flex-col">
      <div className="aspect-square rounded-2xl bg-gradient-to-br from-pink/20 to-purple/20 grid place-items-center text-7xl mb-3">
        {displayThumbnail ? (
          <img
            src={displayThumbnail}
            alt={reward.title}
            className="size-full object-cover rounded-2xl"
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
                  setMessage(null);
                } catch (err) {
                  setMessage((err as Error).message);
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
            <h3
              className="font-display font-extrabold text-lg break-words"
              style={
                titleExpanded
                  ? undefined
                  : {
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }
              }
            >
              {titleText}
            </h3>
            {canExpandTitle && (
              <button
                onClick={() => setTitleExpanded((value) => !value)}
                className="mt-1 text-xs font-extrabold uppercase text-primary"
              >
                {titleExpanded ? "Read less" : "Read more"}
              </button>
            )}
          </div>
          <div className="flex-1 min-h-[3.75rem]">
            <p
              className="text-sm text-muted-foreground break-words"
              style={
                descriptionExpanded
                  ? undefined
                  : {
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }
              }
            >
              {descriptionText || "No description."}
            </p>
            {canExpandDescription && (
              <button
                onClick={() => setDescriptionExpanded((value) => !value)}
                className="mt-1 text-xs font-extrabold uppercase text-primary"
              >
                {descriptionExpanded ? "Read less" : "Read more"}
              </button>
            )}
          </div>
        </>
      )}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        <span className="font-display font-extrabold text-warning text-lg">{reward.xpCost} XP</span>
        {isParent ? (
          <div className="flex gap-2">
            <span
              className={cn(
                "text-xs font-bold uppercase",
                reward.isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              {reward.isActive ? "Active" : "Inactive"}
            </span>
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
                  disabled={updateReward.isPending}
                  className={cn(
                    "rounded-lg text-xs font-extrabold uppercase px-2 py-1",
                    reward.isActive ? "bg-destructive text-destructive-foreground" : "bg-secondary",
                  )}
                >
                  {reward.isActive ? "Delete" : "Activate"}
                </button>
              </>
            )}
          </div>
        ) : (
          <button
            disabled={!affordable || claim.isPending}
            onClick={onClaim}
            className={cn(
              "rounded-xl font-display font-extrabold uppercase text-xs px-4 py-2.5",
              affordable
                ? "bg-primary text-primary-foreground btn-pop"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {claim.isPending ? "Sending..." : affordable ? "Claim" : "Not enough"}
          </button>
        )}
      </div>
      {message && <p className="text-xs text-muted-foreground mt-2">{message}</p>}
    </div>
  );
}

function ClaimRow({ familyId, claim }: { familyId: number; claim: RewardClaimItem }) {
  const resolve = useResolveRewardClaim(familyId, claim.id);
  const [message, setMessage] = useState<string | null>(null);

  const decide = async (decision: "approved" | "rejected") => {
    setMessage(null);
    try {
      await resolve.mutateAsync(decision);
      setMessage(`Claim ${decision}.`);
    } catch (err) {
      setMessage((err as Error).message);
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
      {message && <p className="text-xs text-muted-foreground w-full">{message}</p>}
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
