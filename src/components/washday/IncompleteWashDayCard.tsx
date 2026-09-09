// An unfinished wash day log, offered back to her on the Wash Day page.
//
// Presentation only — it reads the autosaved draft (never a `wash_days` row),
// so it is never counted as a completed wash day anywhere else.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Droplets, Trash2 } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useIncompleteWashLog } from "@/hooks/useIncompleteWashLog";
import { friendlyWashDate } from "@/lib/washLogSteps";

const IncompleteWashDayCard = () => {
  const navigate = useNavigate();
  const { incomplete, discard } = useIncompleteWashLog();
  const [confirm, setConfirm] = useState(false);

  if (!incomplete) return null;

  const done: string[] = [
    ...incomplete.filledSteps,
    ...incomplete.skippedSteps.map((s) => `${s} (skipped)`),
  ];
  if (incomplete.toolCount > 0) {
    done.push(`${incomplete.toolCount} tool${incomplete.toolCount === 1 ? "" : "s"}`);
  }

  return (
    <>
      <SurfaceCard tone="gold">
        <div className="flex items-start gap-3">
          <span className="mt-[2px] inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12">
            <Droplets className="size-3.5 text-primary" aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.16em] text-primary font-medium">
              Incomplete
            </p>
            <p className="font-display text-[15px] leading-snug break-words">
              {friendlyWashDate(incomplete.date)}
            </p>
            <p className="mt-1 font-body text-[12px] text-foreground/75 break-words">
              {done.length
                ? `Already filled in: ${done.join(", ")}${incomplete.hasStyleAnswers ? ", plus your styling notes" : ""}.`
                : "You started this log but haven't added anything yet."}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Button
                variant="gold"
                size="sm"
                className="rounded-pill"
                onClick={() => navigate("/wash/log")}
              >
                Finish this wash day
                <ChevronRight className="size-3.5" aria-hidden />
              </Button>
              <button
                type="button"
                onClick={() => setConfirm(true)}
                className="inline-flex items-center gap-1.5 min-h-[36px] text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Discard
              </button>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard this unfinished wash day?</DialogTitle>
            <DialogDescription>
              Everything you entered for {friendlyWashDate(incomplete.date)} will be
              removed. Nothing has been saved to your wash day history yet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                await discard();
                setConfirm(false);
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default IncompleteWashDayCard;
