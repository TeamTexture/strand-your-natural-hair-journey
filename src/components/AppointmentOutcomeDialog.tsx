import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * THE single "did this appointment happen?" confirmation step.
 *
 * Both the Home follow-up nudge (AppointmentFollowUpDialog) and the
 * retrospective "Leave a review" button on a past appointment card render this
 * component — there is deliberately only one version of this prompt, and only
 * one place that writes the resulting status.
 */

export type AppointmentOutcome = "happened" | "cancelled" | "no_show";

/** Status each answer records — the same values the pro's diary already uses. */
export const outcomeStatus: Record<AppointmentOutcome, string> = {
  happened: "completed",
  cancelled: "cancelled",
  no_show: "no_show",
};

/** Writes the answer to the appointment row. Shared by every caller. */
export const recordAppointmentOutcome = async (
  appointmentId: string,
  outcome: AppointmentOutcome,
  userId?: string | null,
): Promise<void> => {
  const patch =
    outcome === "cancelled"
      ? {
          status: outcomeStatus.cancelled,
          cancelled_at: new Date().toISOString(),
          cancelled_by: userId ?? null,
        }
      : { status: outcomeStatus[outcome] };
  const { error } = await supabase
    .from("appointments")
    .update(patch)
    .eq("id", appointmentId);

  if (error) console.error("Appointment outcome update failed:", error);
};

const AppointmentOutcomeDialog = ({
  appointmentId,
  who,
  dateLabel,
  title,
  description,
  happenedLabel = "Yes, it happened",
  laterLabel = "Not yet — ask me later",
  onHappened,
  onResolved,
  onSilence,
  onClose,
}: {
  appointmentId: string;
  who: string;
  dateLabel?: string;
  title?: string;
  description?: string;
  happenedLabel?: string;
  /** Pass null to hide the snooze option. */
  laterLabel?: string | null;
  /** What "yes" should do — log the appointment, or open the review form. */
  onHappened: () => void;
  /** Fired after a cancelled/no-show answer is written. */
  onResolved?: (outcome: AppointmentOutcome) => void;
  /** Permanently silence this appointment's nudge (dismissal store). */
  onSilence?: () => void;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<"ask" | "cancelled" | "no_show">("ask");

  const resolve = async (outcome: Exclude<AppointmentOutcome, "happened">) => {
    onSilence?.();
    setStep(outcome);
    await recordAppointmentOutcome(appointmentId, outcome, user?.id);
    onResolved?.(outcome);
  };

  if (step !== "ask") {
    const wasCancelled = step === "cancelled";
    return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-[320px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {wasCancelled
                ? "That appointment was cancelled"
                : "That appointment didn't go ahead"}
            </DialogTitle>
            <DialogDescription>
              {wasCancelled
                ? "We've marked it as cancelled — you and your professional will both see that. Would you like to book something else?"
                : "We've marked it as not attended, so we won't ask about it again. Would you like to see other professionals?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={() => { onClose(); navigate("/directory"); }}
              className="w-full rounded-pill min-h-[44px]"
            >
              Find another professional
            </Button>
            <Button variant="ghost" onClick={onClose} className="w-full rounded-pill min-h-[44px]">
              No thanks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[320px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {title ?? `Did you have your appointment with ${who}?`}
          </DialogTitle>
          <DialogDescription>
            {description ?? (dateLabel ? `${dateLabel} — let us know how it went.` : "Let us know how it went.")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => { onSilence?.(); onHappened(); }}
            className="w-full rounded-pill min-h-[44px]"
          >
            {happenedLabel}
          </Button>
          <Button
            variant="outline"
            onClick={() => void resolve("cancelled")}
            className="w-full rounded-pill min-h-[44px]"
          >
            It was cancelled
          </Button>
          <Button
            variant="outline"
            onClick={() => void resolve("no_show")}
            className="w-full rounded-pill min-h-[44px]"
          >
            It didn't happen
          </Button>
          {laterLabel && (
            <Button variant="ghost" onClick={onClose} className="w-full rounded-pill min-h-[44px]">
              {laterLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AppointmentOutcomeDialog;
