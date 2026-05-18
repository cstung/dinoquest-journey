import { cn } from "@/lib/utils";

interface XPBarProps {
  currentXP: number;
  maxXP: number;
  level: number;
  size?: "sm" | "md" | "lg";
  showNumbers?: boolean;
}

export function XPBar({ currentXP, maxXP, level, size = "md", showNumbers = true }: XPBarProps) {
  const pct = Math.min(100, (currentXP / maxXP) * 100);
  const heights = { sm: "h-2", md: "h-3", lg: "h-4" };

  return (
    <div className="flex items-center gap-3 w-full">
      <div className="shrink-0 rounded-full bg-warning text-warning-foreground font-display font-extrabold px-2.5 py-1 text-xs shadow-pop-sm">
        LVL {level}
      </div>
      <div className={cn("relative flex-1 rounded-full bg-muted overflow-hidden", heights[size])}>
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary-dark rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {showNumbers && (
        <div className="shrink-0 text-xs font-bold text-muted-foreground tabular-nums">
          {currentXP.toLocaleString()} / {maxXP.toLocaleString()}
        </div>
      )}
    </div>
  );
}
