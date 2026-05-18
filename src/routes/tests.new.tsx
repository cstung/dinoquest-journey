import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tests/new")({ component: NewTestWizard });

function NewTestWizard() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [generating, setGenerating] = useState(false);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link to="/tests" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground"><ArrowLeft className="size-4" /> Back</Link>
      <h1 className="text-3xl">Create a Test</h1>

      <div className="flex items-center gap-2">
        {([1, 2, 3] as const).map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className={cn(
              "size-9 rounded-full grid place-items-center font-display font-extrabold text-sm",
              s <= step ? "bg-info text-info-foreground" : "bg-muted text-muted-foreground"
            )}>{s}</div>
            <span className={cn("ml-2 text-sm font-extrabold uppercase tracking-wide", s <= step ? "text-foreground" : "text-muted-foreground")}>
              {s === 1 ? "Import" : s === 2 ? "Review" : "Publish"}
            </span>
            {i < 2 && <div className={cn("flex-1 h-1 mx-3 rounded-full", s < step ? "bg-info" : "bg-muted")} />}
          </div>
        ))}
      </div>

      {step === 1 && <Step1 onNext={() => setStep(2)} generating={generating} setGenerating={setGenerating} />}
      {step === 2 && <Step2 onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <Step3 onBack={() => setStep(2)} />}
    </div>
  );
}

const inputCls = "w-full rounded-xl border-2 border-border bg-background px-4 py-2.5 font-bold focus:outline-none focus:border-info";

function Step1({ onNext, generating, setGenerating }: { onNext: () => void; generating: boolean; setGenerating: (v: boolean) => void }) {
  const handleGen = () => {
    setGenerating(true);
    setTimeout(() => { setGenerating(false); onNext(); }, 1800);
  };
  return (
    <div className="rounded-3xl bg-card border-2 border-border p-6 space-y-5">
      <Field label="YouTube URL">
        <input className={inputCls} placeholder="https://youtube.com/watch?v=..." />
      </Field>
      <Field label="Number of Questions">
        <input type="number" defaultValue={10} min={3} max={30} className={inputCls + " max-w-32"} />
      </Field>
      <button onClick={handleGen} disabled={generating} className="w-full rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase py-3.5 shadow-pop-sm inline-flex items-center justify-center gap-2 disabled:opacity-70">
        {generating ? <><Loader2 className="size-5 animate-spin" /> Generating questions…</> : "Generate Quiz"}
      </button>
      {generating && (
        <p className="text-center text-sm text-muted-foreground">Fetching subtitles → Analyzing video → Generating questions…</p>
      )}
    </div>
  );
}

function Step2({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [questions, setQuestions] = useState(
    Array.from({ length: 5 }, (_, i) => ({ id: i, text: `Sample question ${i + 1}?`, options: ["Option A", "Option B", "Option C", "Option D"], correct: 0 }))
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-info/10 border-2 border-info/20 p-4 flex items-center justify-between">
        <div>
          <p className="font-bold text-sm">How Volcanoes Work</p>
          <p className="text-xs text-muted-foreground">Transcript: ~1,240 words · Source: YouTube Auto</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="font-display font-extrabold">Questions ({questions.length})</h3>
        <button onClick={() => setQuestions([...questions, { id: Date.now(), text: "", options: ["", "", "", ""], correct: 0 }])} className="text-sm font-bold text-info inline-flex items-center gap-1"><Plus className="size-4" /> Add Question</button>
      </div>
      {questions.map((q, qi) => (
        <div key={q.id} className="rounded-2xl bg-card border-2 border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase text-muted-foreground">Question {qi + 1}</span>
            <button onClick={() => setQuestions(questions.filter((x) => x.id !== q.id))} className="text-destructive"><Trash2 className="size-4" /></button>
          </div>
          <input defaultValue={q.text} className={inputCls} />
          <div className="grid sm:grid-cols-2 gap-2">
            {q.options.map((opt, oi) => (
              <label key={oi} className={cn("flex items-center gap-2 rounded-xl border-2 px-3 py-2 cursor-pointer", q.correct === oi ? "border-primary bg-primary/10" : "border-border")}>
                <input type="radio" name={`q${q.id}`} defaultChecked={q.correct === oi} className="accent-primary" />
                <input defaultValue={opt} className="flex-1 bg-transparent font-bold text-sm focus:outline-none" />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="rounded-2xl bg-secondary font-display font-extrabold uppercase px-6 py-3"><ArrowLeft className="size-4 inline" /> Back</button>
        <button onClick={onNext} className="flex-1 rounded-2xl bg-info text-info-foreground font-display font-extrabold uppercase py-3 shadow-pop-sm">Next <ArrowRight className="size-4 inline" /></button>
      </div>
    </div>
  );
}

function Step3({ onBack }: { onBack: () => void }) {
  return (
    <div className="rounded-3xl bg-card border-2 border-border p-6 space-y-5">
      <Field label="Test Title"><input className={inputCls} defaultValue="How Volcanoes Work" /></Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Time Limit (min)"><input type="number" defaultValue={30} className={inputCls} /></Field>
        <Field label="Max XP Reward"><input type="number" defaultValue={100} className={inputCls} /></Field>
      </div>
      <Field label="Assign to">
        <div className="grid grid-cols-3 gap-2">
          {["Mia", "Leo", "Sofia"].map((n) => (
            <label key={n} className="flex items-center gap-2 rounded-xl border-2 border-border px-3 py-2 cursor-pointer hover:border-info">
              <input type="checkbox" className="size-4 accent-primary" />
              <span className="font-bold text-sm">{n}</span>
            </label>
          ))}
        </div>
      </Field>
      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="rounded-2xl bg-secondary font-display font-extrabold uppercase px-6 py-3"><ArrowLeft className="size-4 inline" /> Back</button>
        <Link to="/tests" className="flex-1 rounded-2xl bg-primary text-primary-foreground font-display font-extrabold uppercase py-3 btn-pop text-center">Publish Test</Link>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
