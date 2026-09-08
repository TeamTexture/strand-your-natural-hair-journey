// "Did you book with them?" — the missing half of appointment capture.
//
// The existing <BookingReturnPrompt /> only fires when a member taps the
// professional's external booking link INSIDE a chat thread (a
// `pro_booking_clicks` row). A member who is accepted by a professional and then
// books by phone, email, DM or in the salon leaves no click row, so nothing ever
// asks her to record the appointment — and with no appointment row, the reminder,
// the "did it happen?" prompt and the review request can never run.
//
// This asks off the ACCEPTED ENQUIRY instead, which every in-app booking journey
// passes through. Rules:
//   - only when the enquiry has been accepted for at least GRACE_DAYS (she needs
//     time to actually arrange something);
//   - never when an appointment already exists with that professional (logged by
//     her, by the professional, or through the click prompt);
//   - suppression uses the SINGLE existing mechanism, `alert_dismissals`, keyed by
//     (appointment_book_check, enquiry id) — permanent, per-enquiry, never global;
//   - an enquiry older than LAPSE_DAYS is silenced without asking.
//
// Unlike the click prompt this one IS dismissible: she may simply not have booked.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAlertDismissals } from "@/hooks/useAlertDismissals";
import { ALERT_KEYS, alertSignature } from "@/lib/alertKeys";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Days after acceptance before we ask — she needs time to arrange a date. */
export const GRACE_DAYS = 3;
/** Past this, an unanswered enquiry is stale and is silenced without asking. */
export const LAPSE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export const enquiryBookingCheckSignature = (enquiryId: string) =>
  alertSignature(ALERT_KEYS.APPOINTMENT_BOOK_CHECK, [enquiryId]);

export interface EnquiryLike {
  id: string;
  pro_user_id: string;
  responded_at: string | null;
  created_at: string;
}

/** When the clock starts: acceptance if we have it, otherwise the enquiry date. */
export const acceptedAtOf = (e: EnquiryLike): number =>
  Date.parse(e.responded_at ?? e.created_at);

/**
 * Pure selection: the enquiry to ask about, if any. Oldest eligible first, and
 * professionals she already has an appointment with are excluded entirely.
 */
export const selectBookingCheck = (
  enquiries: EnquiryLike[],
  proIdsWithAppointments: Set<string>,
  isDismissed: (id: string) => boolean,
  now = Date.now(),
): { due: EnquiryLike | null; lapsed: EnquiryLike[] } => {
  const open = enquiries
    .filter((e) => !!e.pro_user_id)
    .filter((e) => !proIdsWithAppointments.has(e.pro_user_id))
    .filter((e) => !isDismissed(e.id))
    .filter((e) => Number.isFinite(acceptedAtOf(e)))
    .sort((a, b) => acceptedAtOf(a) - acceptedAtOf(b));

  const lapsed = open.filter((e) => now - acceptedAtOf(e) > LAPSE_DAYS * DAY_MS);
  const lapsedIds = new Set(lapsed.map((e) => e.id));
  const due =
    open.find(
      (e) => !lapsedIds.has(e.id) && now - acceptedAtOf(e) >= GRACE_DAYS * DAY_MS,
    ) ?? null;
  return { due, lapsed };
};

export default function EnquiryBookingCheckDialog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { loaded, isDismissed, dismiss } = useAlertDismissals();
  const [pending, setPending] = useState<{ enquiry: EnquiryLike; proName: string } | null>(null);

  useEffect(() => {
    if (!user || !loaded) return;
    let cancelled = false;
    (async () => {
      const [enquiryRes, apptRes] = await Promise.all([
        supabase
          .from("pro_enquiries")
          .select("id, pro_user_id, responded_at, created_at")
          .eq("consumer_id", user.id)
          .eq("status", "accepted")
          .order("created_at", { ascending: true })
          .limit(30),
        supabase
          .from("appointments")
          .select("linked_pro_user_id")
          .eq("user_id", user.id)
          .not("linked_pro_user_id", "is", null)
          .limit(500),
      ]);
      if (cancelled) return;

      const enquiries = (enquiryRes.data ?? []) as EnquiryLike[];
      if (enquiries.length === 0) return;
      const withAppointments = new Set(
        (apptRes.data ?? [])
          .map((r) => (r as { linked_pro_user_id: string | null }).linked_pro_user_id)
          .filter((v): v is string => !!v),
      );
      // Her own account can appear as the "pro" on self-logged rows — never ask
      // her about booking with herself.
      withAppointments.add(user.id);

      const { due, lapsed } = selectBookingCheck(enquiries, withAppointments, (id) =>
        isDismissed(ALERT_KEYS.APPOINTMENT_BOOK_CHECK, enquiryBookingCheckSignature(id)),
      );

      if (lapsed.length > 0) {
        void dismiss(
          lapsed.map((e) => ({
            key: ALERT_KEYS.APPOINTMENT_BOOK_CHECK,
            signature: enquiryBookingCheckSignature(e.id),
          })),
        );
      }
      if (!due) return;

      const { data: pro } = await supabase
        .from("pro_profiles")
        .select("display_name")
        .eq("user_id", due.pro_user_id)
        .maybeSingle();
      if (cancelled) return;
      setPending({
        enquiry: due,
        proName: (pro?.display_name ?? "").trim() || "your professional",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loaded, isDismissed, dismiss]);

  if (!pending) return null;

  const close = () => {
    void dismiss([
      {
        key: ALERT_KEYS.APPOINTMENT_BOOK_CHECK,
        signature: enquiryBookingCheckSignature(pending.enquiry.id),
      },
    ]);
    setPending(null);
  };

  const addIt = () => {
    const proUserId = pending.enquiry.pro_user_id;
    void dismiss([
      {
        key: ALERT_KEYS.APPOINTMENT_BOOK_CHECK,
        signature: enquiryBookingCheckSignature(pending.enquiry.id),
      },
    ]);
    setPending(null);
    navigate(`/appointments/log?pro=${proUserId}`);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-[320px] rounded-[18px]">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Did you book with {pending.proName}?
          </DialogTitle>
          <DialogDescription className="font-body text-[12px]">
            Add it to your appointments and we'll remind you the day before, then ask
            how it went afterwards so you can leave them a review.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={addIt} className="w-full rounded-pill min-h-[44px]">
            <CalendarPlus className="size-4" strokeWidth={2} />
            Yes — add the appointment
          </Button>
          <button
            type="button"
            onClick={close}
            className="w-full min-h-[40px] text-[11px] font-body text-muted-foreground"
          >
            Not booked yet
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
