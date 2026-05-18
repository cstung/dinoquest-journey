import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFamilyStore } from "@/store";
import { useQuests } from "@/hooks/use-quests";

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

type CalendarQuestItem = {
  id: number;
  title: string;
  dueDate: string;
  type: "quest";
};

function CalendarPage() {
  const today = new Date();
  const familyId = useFamilyStore((s) => s.activeFamilyId);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const questsQuery = useQuests(familyId, { status: "pending" });

  const monthName = new Date(year, month).toLocaleString("en", { month: "long" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = new Date(year, month, 1).getDay();

  const items = useMemo<CalendarQuestItem[]>(() => {
    const quests = questsQuery.data?.items ?? [];
    return quests
      .filter((q) => q.dueDate)
      .map((q) => ({
        id: q.id,
        title: q.title,
        dueDate: q.dueDate as string,
        type: "quest",
      }));
  }, [questsQuery.data?.items]);

  const dayItems = (d: number) =>
    items.filter((item) => {
      const date = new Date(item.dueDate);
      return date.getDate() === d && date.getMonth() === month && date.getFullYear() === year;
    });

  const prev = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };
  const next = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  if (!familyId) {
    return <div className="py-10 text-sm text-muted-foreground">Select a family first.</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Quest Calendar</h1>

      <div className="rounded-3xl bg-card border-2 border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-extrabold text-xl">
            {monthName} {year}
          </h2>
          <div className="flex gap-1">
            <button
              onClick={prev}
              className="size-10 rounded-xl bg-secondary grid place-items-center"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={next}
              className="size-10 rounded-xl bg-secondary grid place-items-center"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-xs font-extrabold uppercase text-muted-foreground py-2">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startDow }).map((_, i) => (
            <div key={`e${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1;
            const dItems = dayItems(d);
            const isToday =
              d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const isSelected = d === selectedDay;
            return (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                className={cn(
                  "aspect-square rounded-xl p-1.5 text-left flex flex-col gap-1 transition-all border-2",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary-dark"
                    : "border-transparent hover:bg-secondary",
                  isToday && !isSelected && "border-info",
                )}
              >
                <span className="text-sm font-extrabold">{d}</span>
                <div className="flex gap-0.5 flex-wrap">
                  {dItems.slice(0, 3).map((_, j) => (
                    <span
                      key={j}
                      className={cn(
                        "size-1.5 rounded-full",
                        isSelected ? "bg-primary-foreground" : "bg-primary",
                      )}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-card border-2 border-border p-5">
        <h3 className="font-display font-extrabold mb-3">
          {monthName} {selectedDay}
        </h3>
        {questsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading schedule...</p>
        ) : questsQuery.error ? (
          <p className="text-sm text-destructive">Failed to load schedule.</p>
        ) : dayItems(selectedDay).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-2">
            {dayItems(selectedDay).map((item) => (
              <li key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40">
                <span className="size-2 rounded-full bg-primary" />
                <span className="font-bold flex-1">{item.title}</span>
                <span className="text-xs font-extrabold uppercase px-2 py-1 rounded bg-card">
                  {item.type}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
