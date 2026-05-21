import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Users, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useAuthStore, useFamilyStore } from "@/store";
import { useFamilies, useJoinFamily } from "@/hooks/use-families";
import { ActionResultModal, type ActionResultVariant } from "@/components/action-result-modal";

export const Route = createFileRoute("/families/")({ component: FamiliesLobby });

type ActionResult = {
  title: string;
  message: string;
  variant: ActionResultVariant;
};

function FamiliesLobby() {
  const { activeFamilyId, setActiveFamily } = useFamilyStore();
  const user = useAuthStore((s) => s.user);
  const { data: families = [], isLoading, error } = useFamilies();
  const joinFamily = useJoinFamily();
  const [joinCode, setJoinCode] = useState("");
  const [joinResult, setJoinResult] = useState<ActionResult | null>(null);
  const isSuperadmin = user?.globalRole === "superadmin";

  if (isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">Loading families...</div>;
  }

  if (error) {
    return (
      <div className="py-10 text-sm text-destructive">
        Failed to load families. Please log in again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl">My Families</h1>
        <div className="flex gap-2">
          {isSuperadmin && (
            <Link
              to="/families/new"
              className="rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase px-5 py-3 btn-pop inline-flex items-center gap-2"
            >
              <Plus className="size-5" strokeWidth={3} /> Create
            </Link>
          )}
        </div>
      </div>

      <div className="rounded-2xl border-2 border-border bg-card p-4 space-y-3">
        <h2 className="font-display font-extrabold uppercase text-sm tracking-wide">Join a Family</h2>
        <div className="flex gap-2 flex-wrap">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter invite code"
            className="min-w-[220px] flex-1 rounded-xl border-2 border-border bg-background px-3 py-2 text-sm font-bold"
          />
          <button
            type="button"
            disabled={joinFamily.isPending || !joinCode.trim()}
            onClick={() => {
              setJoinResult(null);
              joinFamily.mutate(
                { code: joinCode.trim() },
                {
                  onSuccess: (result) => {
                    setActiveFamily(result.familyId, result.role);
                    setJoinCode("");
                    setJoinResult({
                      title: "Completed",
                      message: `Joined ${result.familyName}.`,
                      variant: "success",
                    });
                  },
                  onError: (err) =>
                    setJoinResult({
                      title: "Action Failed",
                      message: (err as Error).message,
                      variant: "error",
                    }),
                },
              );
            }}
            className="rounded-xl bg-info text-info-foreground font-display font-extrabold uppercase px-4 py-2 disabled:opacity-60"
          >
            {joinFamily.isPending ? "Joining..." : "Join"}
          </button>
        </div>
      </div>

      {families.length === 0 ? (
        <div className="rounded-2xl border-2 border-border bg-card p-8 text-center text-sm text-muted-foreground">
          You are not in any family yet.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {families.map((f) => {
            const isActive = f.id === activeFamilyId;
            return (
              <div key={f.id} className="rounded-3xl bg-card border-2 border-border overflow-hidden card-pop flex">
                <div className="w-3 shrink-0" style={{ backgroundColor: f.colorHex }} />
                <div className="flex-1 p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-display font-extrabold text-xl">{f.name}</h2>
                      <p className="text-sm text-muted-foreground italic">{f.motto ?? "No motto set"}</p>
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-1 rounded bg-warning/15 text-warning capitalize">
                      {f.myRole}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="size-4" /> {f.memberCount} members
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setActiveFamily(f.id, f.myRole)}
                      disabled={isActive}
                      className="flex-1 rounded-xl bg-primary text-primary-foreground font-display font-extrabold uppercase text-xs py-2.5 btn-pop disabled:opacity-50"
                    >
                      {isActive ? "Active" : "Switch to"}
                    </button>
                    <Link
                      to="/families/$familyId"
                      params={{ familyId: String(f.id) }}
                      className="rounded-xl bg-secondary font-display font-extrabold uppercase text-xs px-4 py-2.5 inline-flex items-center gap-1"
                    >
                      Manage <ArrowRight className="size-3" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ActionResultModal
        open={!!joinResult}
        title={joinResult?.title ?? ""}
        message={joinResult?.message ?? ""}
        variant={joinResult?.variant}
        onClose={() => setJoinResult(null)}
      />
    </div>
  );
}
