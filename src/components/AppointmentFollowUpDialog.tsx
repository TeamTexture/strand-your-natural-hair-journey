// "Did this appointment happen?" — the ONE surface that asks a member to close
// out an appointment whose date has passed while it still sits at `upcoming`.
//
// Suppression uses the SINGLE existing mechanism, `alert_dismissals`, keyed by
// (alert_key = appointment_follow_up, trigger_signature = appointment id). That
// makes every dismissal:
//   - permanent — the row outlives the session, the device and a reload;
//   - per-appointment — never a global mute, so any OTHER appointment can still
//     raise its own prompt;
//   - surface-independent — anything that later wants to raise this prompt
//     checks the same key/signature pair and stays silent.
//
// (The previous version remembered dismissals in an un-namespaced localStorage
// key, and relied on the status change alone. A second `upcoming` row for the
// same date therefore re-opened the prompt straight after she answered.)
//
// Lapsing: an appointment more than LAPSE_DAYS past its date is treated as
// lapsed — we write the dismissal without asking, so a row nobody ever resolved
// cannot prompt indefinitely. Practically the prompt has one live window: from
// an hour after the scheduled time until LAPSE_DAYS later.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAlertDismissals } from "@/hooks/useAlertDismissals";
import { ALERT_KEYS, alertSignature } from "@/lib/alertKeys";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Trigger an hour after the scheduled time — she may still be at the chair. */
const DELAY_MS = 60 * 60 * 1000;
/** Past this many days an unresolved appointment is lapsed, not pending. */
const LAPSE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Per-appointment dismissal signature — the appointment id, nothing else. */
export const appointmentFollowUpSignature = (appointmentId: string) =>
  alertSignature(ALERT_KEYS.APPOINTMENT_FOLLOW_UP, [appointmentId]);

type PendingAppt = {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  professional_name: string | null;
  clinic_name: string | null;
};

export default function AppointmentFollowUpDialog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { loaded, isDismissed, dismiss } = useAlertDismissals();
  const [pending, setPending] = useState<PendingAppt | null>(null);
  // Second step, shown after "It didn't happen" so the answer isn't a dead end.
  const [step, setStep] = useState<"ask" | "didnt-happen">("ask");

  useEffect(() => {
    if (!user || !loaded) return;
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("appointments")
        .select("id, appointment_date, appointment_time, professional_name, clinic_name")
        .eq("user_id", user.id)
        .eq("status", "upcoming")
        .lte("appointment_date", today)
        .order("appointment_date", { ascending: false })
        .limit(10);
      if (cancelled || !data) return;

      const now = Date.now();
      const rows = data as PendingAppt[];
      const startedAt = (row: PendingAppt) =>
        Date.parse(`${row.appointment_date}T${row.appointment_time ?? "23:59"}:00`);

      // Lapsed rows: silence them once, permanently, without asking.
      const lapsed = rows.filter((row) => {
        if (isDismissed(ALERT_KEYS.APPOINTMENT_FOLLOW_UP, appointmentFollowUpSignature(row.id)))
          return false;
        const t = startedAt(row);
        return Number.isFinite(t) && now - t > LAPSE_DAYS * DAY_MS;
      });
      if (lapsed.length > 0) {
        void dismiss(
          lapsed.map((row) => ({
            key: ALERT_KEYS.APPOINTMENT_FOLLOW_UP,
            signature: appointmentFollowUpSignature(row.id),
          })),
        );
      }

      const lapsedIds = new Set(lapsed.map((r) => r.id));
      const due = rows.find((row) => {
        if (lapsedIds.has(row.id)) return false;
        if (isDismissed(ALERT_KEYS.APPOINTMENT_FOLLOW_UP, appointmentFollowUpSignature(row.id)))
          return false;
        const t = startedAt(row);
        return Number.isFinite(t) && now - t >= DELAY_MS;
      });
      if (due) setPending(due);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loaded, isDismissed, dismiss]);

  if (!pending) return null;

  const who = pending.professional_name || pending.clinic_name || "your appointment";
  const dateLabel = new Date(`${pending.appointment_date}T00:00:00`).toLocaleDateString(
    "en-GB",
    { weekday: "short", day: "numeric", month: "short" },
  );

  /** Permanent, per-appointment silence via the shared dismissal store. */
  const silenceForever = (id: string) =>
    dismiss([
      { key: ALERT_KEYS.APPOINTMENT_FOLLOW_UP, signature: appointmentFollowUpSignature(id) },
    ]);

  const handleLog = () => {
    const id = pending.id;
    void silenceForever(id);
    setPending(null);
    navigate(`/appointments/log?fromId=${id}`);
  };

  // Snooze only — no dismissal written, so it may ask again another day.
  const handleLater = () => {
    setPending(null);
    setStep("ask");
  };

  const handleDidntHappen = async () => {
    const id = pending.id;
    void silenceForever(id);
    setStep("didnt-happen");
    const { error } = await supabase
      .from("appointments")
      .update({ status: "no_show" })
      .eq("id", id);
    if (error) console.error("Appointment not-attended update failed:", error);
  };

  const handleFindAnother = () => {
    setPending(null);
    setStep("ask");
    navigate("/directory");
  };

  const handleNoThanks = () => {
    // Already silenced when she answered "It didn't happen"; closing is final.
    setPending(null);
    setStep("ask");
  };

  if (step === "didnt-happen") {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) handleNoThanks(); }}>
        <DialogContent className="max-w-[320px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              That appointment didn't go ahead
            </DialogTitle>
            <DialogDescription>
              We've marked it as not attended, so we won't ask about it again.
              Would you like to see other professionals?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={handleFindAnother} className="w-full rounded-pill min-h-[44px]">
              Find another professional
            </Button>
            <Button
              variant="ghost"
              onClick={handleNoThanks}
              className="w-full rounded-pill min-h-[44px]"
            >
              No thanks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleLater(); }}>
      <DialogContent className="max-w-[320px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            How was your appointment with {who}?
          </DialogTitle>
          <DialogDescription>
            {dateLabel} — log how it went and we'll pre-fill everything we already
            know from your booking.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleLog} className="w-full rounded-pill min-h-[44px]">
            Log appointment
          </Button>
          <Button
            variant="outline"
            onClick={handleDidntHappen}
            className="w-full rounded-pill min-h-[44px]"
          >
            It didn't happen
          </Button>
          <Button variant="ghost" onClick={handleLater} className="w-full rounded-pill min-h-[44px]">
            Not yet — ask me later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
