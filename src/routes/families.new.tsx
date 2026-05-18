import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useCreateFamily } from "@/hooks/use-families";
import { useFamilyStore } from "@/store";

export const Route = createFileRoute("/families/new")({ component: NewFamily });

const SWATCHES = ["#58CC02", "#1CB0F6", "#CE82FF", "#FF9600", "#FF86C5", "#FFC800"];

function NewFamily() {
  const nav = useNavigate();
  const setActiveFamily = useFamilyStore((s) => s.setActiveFamily);
  const createFamily = useCreateFamily();
  const [name, setName] = useState("");
  const [motto, setMotto] = useState("");
  const [colorHex, setColorHex] = useState(SWATCHES[0]);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const created = await createFamily.mutateAsync({
        name,
        motto: motto || null,
        colorHex,
      });
      setActiveFamily(created.id, "parent");
      nav({ to: "/families/$familyId", params: { familyId: String(created.id) } });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Link to="/families" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground">
        <ArrowLeft className="size-4" /> Families
      </Link>
      <h1 className="text-3xl">Create a Family</h1>
      <form onSubmit={submit} className="rounded-3xl bg-card border-2 border-border p-6 space-y-5">
        <Field label="Family Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="The Rivera Squad" />
        </Field>
        <Field label="Family Motto">
          <input value={motto} onChange={(e) => setMotto(e.target.value)} className={inputCls} placeholder="Learning together..." maxLength={100} />
        </Field>
        <Field label="Family Color">
          <div className="flex gap-2 flex-wrap">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColorHex(c)}
                className={`size-10 rounded-2xl border-2 ${colorHex === c ? "border-foreground" : "border-border"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-3">
          <button
            disabled={createFamily.isPending}
            className="flex-1 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-3.5 btn-pop disabled:opacity-60"
          >
            {createFamily.isPending ? "Creating..." : "Create Family"}
          </button>
          <Link to="/families" className="rounded-2xl bg-secondary font-display font-extrabold uppercase px-6 py-3.5 grid place-items-center">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputCls = "w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-primary";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

