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
        xpCost: newCost,
      });
      setNewTitle("");
      setNewDescription("");
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
          <RewardCard key={r.id} reward={r} familyId={familyId} balance={balance} isParent={isParent} />
        ))}
      </div>

      {isParent && (
        <div className="rounded-2xl border-2 border-border bg-card p-4">
          <h3 className="font-display font-extrabold mb-3">Pending Claims</h3>
          <div className="space-y-2">
            {pendingClaims.map((claim) => (
              <ClaimRow key={claim.id} familyId={familyId} claim={claim} />
            ))}
            {pendingClaims.length === 0 && <p className="text-sm text-muted-foreground">No pending claims.</p>}
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
  reward: { id: number; title: string; description: string | null; xpCost: number; isActive: boolean };
  familyId: number;
  balance: number;
  isParent: boolean;
}) {
  const affordable = balance >= reward.xpCost;
  const claim = useClaimReward(familyId, reward.id);
  const [message, setMessage] = useState<string | null>(null);

  const onClaim = async () => {
    setMessage(null);
    try {
      await claim.mutateAsync();
      setMessage("Claim request sent.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  return (
    <div className="rounded-2xl bg-card border-2 border-border p-5 card-pop flex flex-col">
      <div className="aspect-square rounded-2xl bg-gradient-to-br from-pink/20 to-purple/20 grid place-items-center text-7xl mb-3">
        🎁
      </div>
      <h3 className="font-display font-extrabold text-lg">{reward.title}</h3>
      <p className="text-sm text-muted-foreground flex-1">{reward.description}</p>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        <span className="font-display font-extrabold text-warning text-lg">{reward.xpCost} XP</span>
        {isParent ? (
          <span className={cn("text-xs font-bold uppercase", reward.isActive ? "text-primary" : "text-muted-foreground")}>
            {reward.isActive ? "Active" : "Inactive"}
          </span>
        ) : (
          <button
            disabled={!affordable || claim.isPending}
            onClick={onClaim}
            className={cn(
              "rounded-xl font-display font-extrabold uppercase text-xs px-4 py-2.5",
              affordable ? "bg-primary text-primary-foreground btn-pop" : "bg-muted text-muted-foreground cursor-not-allowed",
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
        <p className="font-bold text-sm">{claim.username} requested {claim.rewardTitle}</p>
        <p className="text-xs text-muted-foreground">{new Date(claim.requestedAt).toLocaleString()}</p>
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
