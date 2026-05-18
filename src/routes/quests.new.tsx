import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/quests/new")({ component: NewQuest });

function NewQuest() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/quests" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground"><ArrowLeft className="size-4" /> Back</Link>
      <h1 className="text-3xl">Create a Quest</h1>

      <form className="space-y-5 rounded-3xl bg-card border-2 border-border p-6">
        <Field label="Title">
          <input className={inputCls} placeholder="Read for 20 minutes" />
        </Field>
        <Field label="Description">
          <textarea rows={4} className={inputCls + " resize-none"} placeholder="What needs to be done?" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Category">
            <select className={inputCls}><option>Daily</option><option>Learning</option><option>Creative</option><option>Epic</option></select>
          </Field>
          <Field label="Difficulty">
            <select className={inputCls}><option>Easy</option><option>Medium</option><option>Hard</option><option>Epic</option></select>
          </Field>
          <Field label="XP Reward">
            <input type="number" defaultValue={10} className={inputCls} />
          </Field>
          <Field label="Due Date">
            <input type="date" className={inputCls} />
          </Field>
        </div>
        <label className="flex items-center gap-2 font-bold text-sm">
          <input type="checkbox" className="size-5 rounded-md accent-primary" />
          Make this a recurring quest
        </label>
        <div className="flex gap-3 pt-2">
          <button type="button" className="flex-1 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-3.5 btn-pop">Create Quest</button>
          <Link to="/quests" className="rounded-2xl bg-secondary font-display font-extrabold uppercase px-6 py-3.5 grid place-items-center">Cancel</Link>
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
