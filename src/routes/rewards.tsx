import { createFileRoute } from "@tanstack/react-router";
import { rewards } from "@/data/mock";
import { useAuthStore } from "@/store";
import { Plus, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rewards")({ component: RewardsPage });

function RewardsPage() {
  const user = useAuthStore((s) => s.user);
  const balance = user?.xp ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl">Reward Shop</h1>
        <button className="rounded-2xl bg-pink text-pink-foreground font-display font-extrabold uppercase px-5 py-3 shadow-pop-sm inline-flex items-center gap-2">
          <Plus className="size-5" strokeWidth={3} /> Add Reward
        </button>
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

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rewards.map((r) => {
          const affordable = balance >= r.xpCost;
          return (
            <div key={r.id} className="rounded-2xl bg-card border-2 border-border p-5 card-pop flex flex-col">
              <div className="aspect-square rounded-2xl bg-gradient-to-br from-pink/20 to-purple/20 grid place-items-center text-7xl mb-3">
                {r.emoji}
              </div>
              <h3 className="font-display font-extrabold text-lg">{r.title}</h3>
              <p className="text-sm text-muted-foreground flex-1">{r.description}</p>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                <span className="font-display font-extrabold text-warning text-lg">{r.xpCost} XP</span>
                <button
                  disabled={!affordable}
                  className={cn(
                    "rounded-xl font-display font-extrabold uppercase text-xs px-4 py-2.5",
                    affordable ? "bg-primary text-primary-foreground btn-pop" : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                  {affordable ? "Claim" : "Not enough"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
