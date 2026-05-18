import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, QrCode, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/families/join")({ component: JoinFamily });

function JoinFamily() {
  const [tab, setTab] = useState<"code" | "qr">("code");
  return (
    <div className="max-w-md mx-auto space-y-6">
      <Link to="/families" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground"><ArrowLeft className="size-4" /> Families</Link>
      <h1 className="text-3xl">Join a Family</h1>

      <div className="grid grid-cols-2 gap-1 p-1 bg-secondary rounded-2xl">
        <button onClick={() => setTab("code")} className={cn("rounded-xl font-display font-extrabold uppercase text-xs py-2.5 inline-flex items-center justify-center gap-2", tab === "code" ? "bg-card shadow-pop-sm" : "text-muted-foreground")}>
          <KeyRound className="size-4" /> Code
        </button>
        <button onClick={() => setTab("qr")} className={cn("rounded-xl font-display font-extrabold uppercase text-xs py-2.5 inline-flex items-center justify-center gap-2", tab === "qr" ? "bg-card shadow-pop-sm" : "text-muted-foreground")}>
          <QrCode className="size-4" /> Scan QR
        </button>
      </div>

      <div className="rounded-3xl bg-card border-2 border-border p-6">
        {tab === "code" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Ask a family parent for the 6-digit invite code.</p>
            <input maxLength={6} placeholder="A3K9P2" className="w-full text-center font-display font-extrabold text-4xl tracking-[0.3em] rounded-2xl border-2 border-border bg-background py-5 uppercase focus:outline-none focus:border-primary" />
            <button className="w-full rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-3.5 btn-pop">Join</button>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="aspect-square rounded-2xl bg-gradient-to-br from-info/20 to-purple/20 border-2 border-dashed border-border grid place-items-center">
              <div>
                <QrCode className="size-16 mx-auto text-muted-foreground" />
                <p className="text-sm font-bold mt-2 text-muted-foreground">Camera viewfinder</p>
              </div>
            </div>
            <button className="w-full rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase py-3.5 shadow-pop-sm">Allow Camera</button>
          </div>
        )}
      </div>
    </div>
  );
}
