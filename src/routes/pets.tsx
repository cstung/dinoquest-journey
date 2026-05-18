import { createFileRoute } from "@tanstack/react-router";
import { pets } from "@/data/mock";
import { XPBar } from "@/components/xp-bar";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pets")({ component: PetsPage });

function PetsPage() {
  const [activeId, setActiveId] = useState(pets.find((p) => p.active)?.id ?? pets[0].id);
  const active = pets.find((p) => p.id === activeId)!;
  const others = pets.filter((p) => p.id !== activeId);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">My Dinos</h1>

      <div className="rounded-3xl bg-gradient-to-br from-info/20 via-primary-light/30 to-purple/20 border-2 border-info/20 p-8 text-center space-y-5">
        <div className="text-9xl animate-bounce-soft inline-block drop-shadow-lg">{active.emoji}</div>
        <div>
          <h2 className="text-4xl">{active.name}</h2>
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            <span className="text-xs font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-md bg-info/15 text-info">{active.species}</span>
            <span className="text-xs font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-md bg-purple/15 text-purple capitalize">{active.stage}</span>
          </div>
        </div>
        <div className="max-w-md mx-auto bg-card rounded-2xl p-4 shadow-pop-sm">
          <XPBar currentXP={active.xp} maxXP={active.xpToNext} level={active.level} />
          <p className="text-xs text-muted-foreground mt-2">Last fed: {active.lastFed}</p>
        </div>
        <div className="flex justify-center gap-3 flex-wrap">
          <button className="rounded-2xl bg-warning text-warning-foreground font-display font-extrabold uppercase px-6 py-3 shadow-pop-sm">🍖 Feed Pet</button>
          <button className="rounded-2xl bg-purple text-purple-foreground font-display font-extrabold uppercase px-6 py-3 shadow-pop-sm">✨ Evolve</button>
        </div>
      </div>

      <div>
        <h3 className="font-display font-extrabold text-xl mb-3">Your collection</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {others.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              className={cn(
                "rounded-2xl border-2 border-border bg-card p-4 text-center card-pop hover:border-info/50 transition-all"
              )}
            >
              <div className="text-5xl mb-2">{p.emoji}</div>
              <div className="font-display font-extrabold">{p.name}</div>
              <div className="text-xs text-muted-foreground capitalize">{p.stage} · Lv {p.level}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
