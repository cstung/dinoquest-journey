import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ActionResultVariant = "success" | "warning" | "error" | "info";

export type ActionResultModalProps = {
  open: boolean;
  title: string;
  message: string;
  variant?: ActionResultVariant;
  onClose: () => void;
};

const VARIANT_STYLES: Record<ActionResultVariant, { badge: string; button: string }> = {
  success: {
    badge: "bg-success/15 text-success-foreground border-success/30",
    button: "bg-success text-success-foreground",
  },
  warning: {
    badge: "bg-warning/15 text-warning border-warning/30",
    button: "bg-warning text-warning-foreground",
  },
  error: {
    badge: "bg-destructive/15 text-destructive border-destructive/30",
    button: "bg-destructive text-destructive-foreground",
  },
  info: {
    badge: "bg-info/15 text-info border-info/30",
    button: "bg-primary text-primary-foreground",
  },
};

export function ActionResultModal({
  open,
  title,
  message,
  variant = "info",
  onClose,
}: ActionResultModalProps) {
  const style = VARIANT_STYLES[variant];

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-sm rounded-3xl border-2 border-border bg-card p-6 shadow-pop-lg">
        <DialogHeader className="space-y-2">
          <span
            className={cn(
              "inline-flex w-fit rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide",
              style.badge,
            )}
          >
            {variant}
          </span>
          <DialogTitle className="font-display text-2xl font-extrabold leading-tight">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{message}</DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "mt-3 w-full rounded-2xl py-3 font-display font-extrabold uppercase shadow-pop-sm",
            style.button,
          )}
        >
          Close
        </button>
      </DialogContent>
    </Dialog>
  );
}
