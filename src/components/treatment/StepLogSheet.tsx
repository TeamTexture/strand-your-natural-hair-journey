import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { slotLabel, type TreatmentSlot } from "@/lib/treatmentSchedule";

const OPENERS = [
  "Went as planned",
  "Scalp felt calm",
  "Scalp felt tight",
  "Hair drank it up",
  "Rushed it a bit",
  "Used less than usual",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskName: string;
  slot: TreatmentSlot;
  instructions?: string | null;
  saving?: boolean;
  onSave: (note: string) => void;
}

/**
 * Logging a step is a proper log, not a tick: she says how it actually went, in
 * her own words or with one tap on an opener. That note is what makes the
 * progress view and her check-ins worth reading later.
 */
const StepLogSheet = ({
  open,
  onOpenChange,
  taskName,
  slot,
  instructions,
  saving,
  onSave,
}: Props) => {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  const submit = () => {
    if (note.trim().length < 3) {
      toast.error("Add a line about how it went — a tap on one of the options is plenty");
      return;
    }
    onSave(note.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[335px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px] leading-tight">Log this step</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {slotLabel(slot)}
            </p>
            <p className="font-display text-[16px] leading-snug break-words">{taskName}</p>
            {instructions && (
              <p className="font-body text-[12px] text-muted-foreground leading-snug mt-0.5 [overflow-wrap:anywhere]">
                {instructions}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {OPENERS.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setNote((n) => (n.trim() ? `${n.trim()} ${o}` : o))}
                className={cn(
                  "rounded-pill border border-border bg-card px-2.5 py-1.5 font-body text-[12px] min-h-[34px]",
                )}
              >
                {o}
              </button>
            ))}
          </div>

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="How did it go? Anything you noticed on your scalp or your ends."
          />

          <Button variant="gold" className="w-full rounded-pill" disabled={saving} onClick={submit}>
            Save this log
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StepLogSheet;
