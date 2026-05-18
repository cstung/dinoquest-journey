import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, QrCode, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJoinFamily } from "@/hooks/use-families";

export const Route = createFileRoute("/families/join")({ component: JoinFamily });

function JoinFamily() {
  const nav = useNavigate();
  const [tab, setTab] = useState<"code" | "qr">("code");
  const [code, setCode] = useState("");
  const [qrToken, setQrToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const joinFamily = useJoinFamily();

  const joinByCode = async () => {
    setError(null);
    try {
      await joinFamily.mutateAsync({ code: code.replace(/\s/g, "") });
      nav({ to: "/families" });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const joinByQrToken = async () => {
    setError(null);
    try {
      await joinFamily.mutateAsync({ qrToken: qrToken.trim() });
      nav({ to: "/families" });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <Link to="/families" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground">
        <ArrowLeft className="size-4" /> Families
      </Link>
      <h1 className="text-3xl">Join a Family</h1>

      <div className="grid grid-cols-2 gap-1 p-1 bg-secondary rounded-2xl">
        <button
          onClick={() => setTab("code")}
          className={cn(
            "rounded-xl font-display font-extrabold uppercase text-xs py-2.5 inline-flex items-center justify-center gap-2",
            tab === "code" ? "bg-card shadow-pop-sm" : "text-muted-foreground",
          )}
        >
          <KeyRound className="size-4" /> Code
        </button>
        <button
          onClick={() => setTab("qr")}
          className={cn(
            "rounded-xl font-display font-extrabold uppercase text-xs py-2.5 inline-flex items-center justify-center gap-2",
            tab === "qr" ? "bg-card shadow-pop-sm" : "text-muted-foreground",
          )}
        >
          <QrCode className="size-4" /> QR Token
        </button>
      </div>

      <div className="rounded-3xl bg-card border-2 border-border p-6">
        {tab === "code" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Ask a family parent for the 6-digit invite code.</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={7}
              placeholder="042819"
              className="w-full text-center font-display font-extrabold text-4xl tracking-[0.3em] rounded-2xl border-2 border-border bg-background py-5 uppercase focus:outline-none focus:border-primary"
            />
            <button
              onClick={joinByCode}
              disabled={joinFamily.isPending}
              className="w-full rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-3.5 btn-pop disabled:opacity-60"
            >
              {joinFamily.isPending ? "Joining..." : "Join"}
            </button>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <input
              value={qrToken}
              onChange={(e) => setQrToken(e.target.value)}
              placeholder="Paste QR token"
              className="w-full rounded-2xl border-2 border-border bg-background px-4 py-3 font-bold focus:outline-none focus:border-primary"
            />
            <button
              onClick={joinByQrToken}
              disabled={joinFamily.isPending || !qrToken.trim()}
              className="w-full rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase py-3.5 shadow-pop-sm disabled:opacity-60"
            >
              {joinFamily.isPending ? "Joining..." : "Join with Token"}
            </button>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}

