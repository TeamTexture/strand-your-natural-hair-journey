import { useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CalendarPlus, Check, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import TimePicker12h from "@/components/TimePicker12h";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import { allowsMemberFeatures } from "@/lib/viewFeatures";
import {
  useMarkBookingClickPrompted,
  usePendingBookingClicks,
  useResolveBookingClick,
  type PendingBookingClick,
} from "@/hooks/usePendingBookingClicks";
import {
  addToCalendar,
  googleCalendarUrl,
  type CalendarEvent,
} from "@/lib/addToCalendar";
import {
  appointmentTitleOf,
  appointmentLocationOf,
  isPastDateIso,
} from "@/lib/appointmentState";
import { cn } from "@/lib/utils";

/**
 * Phase 2 — the return prompt after a member leaves for a professional's
 * booking page.
 *
 * NON-DISMISSIBLE BY DESIGN. There is no close button, backdrop tap, escape key
 * or back gesture out of it: the only exits are "Yes, I booked" (which saves an
 * appointment) and "I didn't book" (which resolves the click). Radix gives us
 * the focus trap and `role="dialog"` for free; we suppress every escape hatch it
 * normally provides.
 */

type Step = "ask" | "form" | "calendar";
type Format = "in_person" | "virtual";

const FIELD =
  "w-full text-sm p-2.5 rounded-[10px] border border-border bg-card focus:outline-none focus:border-primary/60";

const BookingReturnPrompt = () => {
  const { user, loading } = useAuth();
  const view = useActiveRoleView();
  const isMemberView = allowsMemberFeatures(view);
  const { data: pending = [] } = usePendingBookingClicks();
  const markPrompted = useMarkBookingClickPrompted();
  const resolve = useResolveBookingClick();

  // Strictly one at a time, oldest first. Never stack modals.
  const click: PendingBookingClick | null = isMemberView ? (pending[0] ?? null) : null;

  const [step, setStep] = useState<Step>("ask");
  const [date, setDate] = useState(""); // no pre-filled guess
  const [time, setTime] = useState("");
  const [service, setService] = useState("");
  const [format, setFormat] = useState<Format | "">("");
  const [notes, setNotes] = useState("");
  const [pastConfirmed, setPastConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; title: string; location: string | null } | null>(
    null,
  );
  const [promptedFor, setPromptedFor] = useState<string | null>(null);

  const clickId = click?.id ?? null;

  // Reset the form when the prompt moves on to the next pending click.
  useEffect(() => {
    if (!clickId) return;
    setStep("ask");
    setDate("");
    setTime("");
    setService("");
    setNotes("");
    setPastConfirmed(false);
    setSaved(null);
  }, [clickId]);

  // Default the format from the professional's profile where known.
  useEffect(() => {
    if (click) setFormat(click.pro_default_format ?? "");
  }, [click?.id, click?.pro_default_format, click]);

  // Stamp `prompted_at` once, the first time this click is actually on screen.
  // A failed stamp is not fatal — the click stays pending and we ask again.
  useEffect(() => {
    if (!clickId || !click || click.prompted_at || promptedFor === clickId) return;
    setPromptedFor(clickId);
    markPrompted.mutate(clickId);
  }, [clickId, click, promptedFor, markPrompted]);

  const dateIsPast = isPastDateIso(date);
  const canSave =
    !!date && !!time && !!service.trim() && !!format && (!dateIsPast || pastConfirmed);

  const calendarEvent: CalendarEvent | null = useMemo(() => {
    if (!saved) return null;
    return {
      title: saved.title,
      date,
      time: time || null,
      location: saved.location,
      description: notes.trim() || null,
      uid: `${saved.id}@strand.app`,
    };
  }, [saved, date, time, notes]);

  // Wait for auth to resolve before asking anything.
  if (loading || !user || !click) return null;

  const didNotBook = async () => {
    try {
      // A valid answer, not an error. Resolved for good — never re-asked.
      await resolve.mutateAsync({ clickId: click.id, outcome: "not_booked" });
    } catch {
      toast.error("Couldn't save that just now. Please try again.");
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const row = {
        user_id: user.id,
        created_by: user.id,
        professional_name: click.pro_name,
        professional_type: click.pro_discipline,
        clinic_name: format === "in_person" ? click.pro_clinic_name : null,
        linked_pro_user_id: click.professional_id,
        appointment_date: date,
        appointment_time: time,
        service: service.trim(),
        location_format: format,
        notes: notes.trim() || null,
        status: dateIsPast ? "completed" : "upcoming",
      };
      const { data, error } = await supabase
        .from("appointments")
        .insert(row as never)
        .select("id")
        .single();
      if (error) throw error;

      const id = (data as { id: string }).id;
      await resolve.mutateAsync({
        clickId: click.id,
        outcome: "booked",
        appointmentId: id,
      });
      setSaved({
        id,
        title: appointmentTitleOf(row),
        location: appointmentLocationOf(row),
      });
      setStep("calendar");
    } catch (e) {
      // Offline or a failed write: the entered data stays exactly where it is,
      // and the click is not resolved, so the prompt returns.
      console.error("Appointment save failed:", e);
      toast.error("Couldn't save your appointment. Your details are still here — try again.");
    } finally {
      setSaving(false);
    }
  };

  const finish = () => {
    // The click is already resolved at this point; clearing local state lets the
    // next pending click (if any) take over.
    setSaved(null);
    setStep("ask");
  };

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[70] bg-foreground/55 backdrop-blur-[2px]"
          // Backdrop taps do nothing.
          onPointerDown={(e) => e.preventDefault()}
        />
        <DialogPrimitive.Content
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-return-title"
          className="fixed left-1/2 top-1/2 z-[71] w-[calc(100%-32px)] max-w-[343px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-border bg-background p-5 shadow-lg max-h-[88vh] overflow-y-auto"
          // No escape key, no outside click, no back-gesture close.
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {step === "ask" && (
            <div className="space-y-4">
              <DialogPrimitive.Title
                id="booking-return-title"
                className="font-display text-[21px] font-semibold leading-snug"
              >
                Did you book with {click.pro_name}?
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-[12.5px] font-body leading-relaxed text-muted-foreground">
                Logging it keeps your STRAND timeline accurate, and your
                professional can see the visit alongside your hair record.
              </DialogPrimitive.Description>
              <div className="space-y-2">
                <Button
                  onClick={() => setStep("form")}
                  className="w-full min-h-[48px] rounded-pill text-[11.5px] font-semibold uppercase tracking-[0.08em]"
                >
                  <Check className="size-4 mr-1.5" aria-hidden="true" />
                  Yes, I booked
                </Button>
                <Button
                  variant="outline"
                  onClick={didNotBook}
                  disabled={resolve.isPending}
                  className="w-full min-h-[48px] rounded-pill border-border text-[11.5px] font-semibold uppercase tracking-[0.08em]"
                >
                  {resolve.isPending ? "Saving…" : "I didn't book"}
                </Button>
              </div>
            </div>
          )}

          {step === "form" && (
            <div className="space-y-3.5">
              <DialogPrimitive.Title
                id="booking-return-title"
                className="font-display text-[20px] font-semibold leading-snug"
              >
                Your appointment with {click.pro_name}
              </DialogPrimitive.Title>
              <p className="text-[12px] font-body leading-relaxed text-muted-foreground">
                This logs it in your STRAND diary and tags {click.pro_name}, so it
                shows as upcoming for you both. You can add it to Google or Apple
                Calendar next.
              </p>


              <div>
                <label
                  htmlFor="appt-date"
                  className="mb-1.5 block text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Date
                </label>
                <Input
                  id="appt-date"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setPastConfirmed(false);
                  }}
                  className="rounded-[10px]"
                />
              </div>

              {dateIsPast && (
                <div className="rounded-[12px] border border-primary/30 bg-primary/8 p-3">
                  <p className="text-[11.5px] font-body leading-snug text-foreground/85">
                    That date has already passed. Logging an appointment you've
                    already had?
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-[11.5px] font-body font-semibold">
                    <input
                      type="checkbox"
                      checked={pastConfirmed}
                      onChange={(e) => setPastConfirmed(e.target.checked)}
                      className="size-4 accent-primary"
                    />
                    Yes, that's right
                  </label>
                </div>
              )}

              <div>
                <span className="mb-1.5 block text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Time
                </span>
                <TimePicker12h value={time} onChange={setTime} />
              </div>

              <div>
                <label
                  htmlFor="appt-service"
                  className="mb-1.5 block text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Service or treatment
                </label>
                <Input
                  id="appt-service"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  placeholder="Consultation, silk press, colour…"
                  className="rounded-[10px]"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Location
                </span>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Location">
                  {(
                    [
                      ["in_person", "In person"],
                      ["virtual", "Virtual"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={format === v}
                      onClick={() => setFormat(v)}
                      className={cn(
                        "min-h-[44px] rounded-[10px] border text-[12px] font-body font-semibold",
                        format === v
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="appt-notes"
                  className="mb-1.5 block text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Notes (optional)
                </label>
                <Textarea
                  id="appt-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className={FIELD}
                />
              </div>

              <div className="space-y-2 pt-1">
                <Button
                  onClick={save}
                  disabled={!canSave || saving}
                  className="w-full min-h-[48px] rounded-pill text-[11.5px] font-semibold uppercase tracking-[0.08em]"
                >
                  {saving ? "Saving…" : "Save appointment"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setStep("ask")}
                  className="w-full min-h-[44px] rounded-pill text-[11px] font-body uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Back
                </Button>
              </div>
            </div>
          )}

          {step === "calendar" && calendarEvent && (
            <div className="space-y-4">
              <div className="space-y-1">
                <DialogPrimitive.Title
                  id="booking-return-title"
                  className="font-display text-[20px] font-semibold leading-snug"
                >
                  Logged in STRAND
                </DialogPrimitive.Title>
                <p className="text-[12.5px] font-body leading-relaxed text-muted-foreground">
                  It's in your STRAND diary as upcoming
                  {click.pro_exists ? ", and shows in your professional's diary too" : ""}.
                </p>
              </div>

              <div className="rounded-[12px] border border-border bg-card p-3">
                <p className="text-[12.5px] font-body font-semibold leading-snug">
                  {saved?.title}
                </p>
                <p className="mt-0.5 text-[11.5px] font-body text-muted-foreground">
                  {new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                  })}
                  {time ? ` · ${time}` : ""}
                </p>
              </div>


              <div className="space-y-2">
                <p className="text-[10px] font-body font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Optional — also add it to your phone
                </p>
                <a
                  href={googleCalendarUrl(calendarEvent)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-pill border border-border px-4 text-[11px] font-body font-semibold uppercase tracking-[0.08em]"
                >
                  <CalendarPlus className="size-3.5" aria-hidden="true" />
                  Google Calendar
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  onClick={() => addToCalendar(calendarEvent)}
                  className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-pill border border-border px-4 text-[11px] font-body font-semibold uppercase tracking-[0.08em]"
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  Apple, Outlook or other (.ics)
                </button>
                <p className="text-[11px] font-body leading-snug text-muted-foreground">
                  If you already got a calendar invite when you booked on{" "}
                  {click.pro_name}'s website, you're all set — no need to add it
                  again here.
                </p>
              </div>

              <Button
                onClick={finish}
                className="w-full min-h-[48px] rounded-pill text-[11.5px] font-semibold uppercase tracking-[0.08em]"
              >
                Done
              </Button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default BookingReturnPrompt;
