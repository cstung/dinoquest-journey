import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { XPBar } from "@/components/xp-bar";
import { useFamilyStore } from "@/store";
import { useCreatePet, useFeedPet, usePets, type PetItem } from "@/hooks/use-pets";
import { apiRequest } from "@/lib/api";
import { ActionResultModal, type ActionResultVariant } from "@/components/action-result-modal";

export const Route = createFileRoute("/pets")({ component: PetsPage });

const STAGE_EMOJI: Record<string, string> = {
  egg: "🥚",
  hatchling: "🦕",
  adult: "🦖",
  evolved: "🐉",
};

type ActionResult = {
  title: string;
  message: string;
  variant: ActionResultVariant;
};

function PetsPage() {
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const role = useFamilyStore((s) => s.activeFamilyRole);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newSpecies, setNewSpecies] = useState("Unknown");
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const queryClient = useQueryClient();

  const petsQuery = usePets(familyId);
  const createPet = useCreatePet(familyId);
  const pets = petsQuery.data?.items ?? [];
  const active = useMemo(
    () => pets.find((p) => p.id === activeId) ?? pets.find((p) => p.isActive) ?? pets[0],
    [pets, activeId],
  );

  const feedPet = useFeedPet(familyId, active?.id ?? null);

  useEffect(() => {
    if (!active && pets.length > 0) setActiveId(pets[0].id);
  }, [active, pets]);

  if (!familyId) {
    return <div className="py-10 text-sm text-muted-foreground">Select a family first.</div>;
  }

  if (petsQuery.isLoading) {
    return <div className="py-10 text-sm text-muted-foreground">Loading pets...</div>;
  }

  if (petsQuery.error) {
    return <div className="py-10 text-sm text-destructive">Failed to load pets.</div>;
  }

  const create = async () => {
    setActionResult(null);
    try {
      const created = await createPet.mutateAsync({ name: newName, species: newSpecies });
      setNewName("");
      setActiveId(created.id);
      setActionResult({ title: "Created", message: "Pet created.", variant: "success" });
    } catch (err) {
      setActionResult({ title: "Action Failed", message: (err as Error).message, variant: "error" });
    }
  };

  const feed = async () => {
    setActionResult(null);
    try {
      const result = await feedPet.mutateAsync();
      setActionResult({
        title: result.levelUp ? "Level Up" : "Completed",
        message: result.levelUp
          ? `Fed! +${result.gainedXp} XP and level up to ${result.level}.`
          : `Fed! +${result.gainedXp} XP.`,
        variant: "success",
      });
    } catch (err) {
      setActionResult({ title: "Action Failed", message: (err as Error).message, variant: "error" });
    }
  };

  const setAsActive = async (pet: PetItem) => {
    setActionResult(null);
    try {
      await apiRequest<PetItem>(`/api/families/${familyId}/pets/${pet.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: true }),
      });
      queryClient.invalidateQueries({ queryKey: ["pets", familyId] });
      setActiveId(pet.id);
      setActionResult({ title: "Updated", message: "Active pet updated.", variant: "success" });
    } catch (err) {
      setActionResult({ title: "Action Failed", message: (err as Error).message, variant: "error" });
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">My Dinos</h1>

      {!active ? (
        <div className="rounded-2xl border-2 border-border bg-card p-6 space-y-4">
          <h2 className="text-xl">Create your first pet</h2>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Pet name"
            className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-info"
          />
          <input
            value={newSpecies}
            onChange={(e) => setNewSpecies(e.target.value)}
            placeholder="Species"
            className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-info"
          />
          <button
            onClick={create}
            disabled={createPet.isPending}
            className="rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase px-6 py-3 btn-pop disabled:opacity-60"
          >
            {createPet.isPending ? "Creating..." : "Create Pet"}
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-3xl bg-gradient-to-br from-info/20 via-primary-light/30 to-purple/20 border-2 border-info/20 p-8 text-center space-y-5">
            <div className="text-9xl animate-bounce-soft inline-block drop-shadow-lg">
              {STAGE_EMOJI[active.stage] ?? "🦖"}
            </div>
            <div>
              <h2 className="text-4xl">{active.name}</h2>
              <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                <span className="text-xs font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-md bg-info/15 text-info">
                  {active.species}
                </span>
                <span className="text-xs font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-md bg-purple/15 text-purple capitalize">
                  {active.stage}
                </span>
              </div>
            </div>
            <div className="max-w-md mx-auto bg-card rounded-2xl p-4 shadow-pop-sm">
              <XPBar currentXP={active.xp} maxXP={active.xp + active.xpToNext} level={active.level} />
              <p className="text-xs text-muted-foreground mt-2">
                Last fed: {active.lastFedAt ? new Date(active.lastFedAt).toLocaleString() : "Never"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Owner: {active.username}</p>
            </div>
            <div className="flex justify-center gap-3 flex-wrap">
              <button
                onClick={feed}
                disabled={feedPet.isPending}
                className="rounded-2xl bg-warning text-warning-foreground font-display font-extrabold uppercase px-6 py-3 shadow-pop-sm disabled:opacity-60"
              >
                {feedPet.isPending ? "Feeding..." : "Feed Pet"}
              </button>
              {!active.isActive && (
                <button
                  onClick={() => setAsActive(active)}
                  className="rounded-2xl bg-purple text-purple-foreground font-display font-extrabold uppercase px-6 py-3 shadow-pop-sm"
                >
                  Set Active
                </button>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-display font-extrabold text-xl mb-3">Your collection</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {pets
                .filter((p) => p.id !== active.id)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveId(p.id)}
                    className={cn(
                      "rounded-2xl border-2 border-border bg-card p-4 text-center card-pop hover:border-info/50 transition-all",
                    )}
                  >
                    <div className="text-5xl mb-2">{STAGE_EMOJI[p.stage] ?? "🦖"}</div>
                    <div className="font-display font-extrabold">{p.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {p.stage} · Lv {p.level}
                    </div>
                  </button>
                ))}
            </div>
            {role === "parent" || role === "child" ? (
              <div className="rounded-2xl border-2 border-border bg-card p-4 mt-4 grid sm:grid-cols-3 gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New pet name"
                  className="rounded-xl border-2 border-border bg-background px-3 py-2 font-bold text-sm focus:outline-none focus:border-info"
                />
                <input
                  value={newSpecies}
                  onChange={(e) => setNewSpecies(e.target.value)}
                  placeholder="Species"
                  className="rounded-xl border-2 border-border bg-background px-3 py-2 font-bold text-sm focus:outline-none focus:border-info"
                />
                <button
                  onClick={create}
                  disabled={createPet.isPending}
                  className="rounded-xl bg-primary text-primary-foreground font-display font-extrabold uppercase text-sm px-3 py-2 btn-pop disabled:opacity-60"
                >
                  {createPet.isPending ? "Creating..." : "Add Pet"}
                </button>
              </div>
            ) : null}
          </div>
        </>
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
