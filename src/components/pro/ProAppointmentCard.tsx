import { MessageCircle, Check, AlertTriangle, XCircle, ChevronRight, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import ProAvatar from "@/components/ProAvatar";
import AddToCalendarButton from "@/components/AddToCalendarButton";
import type { CalendarEvent } from "@/lib/addToCalendar";
import { formatTime12h } from "@/lib/formatTime";
import type { ProAppointmentRow } from "@/hooks/useProAppointments";
import { appointmentPurpose, appointmentWhere } from "@/lib/appointmentDisplay";


interface Props {
  appointment: ProAppointmentRow;
  variant: "upcoming" | "past";
  busy?: boolean;
  highlight?: boolean;
  onOpenDetail: () => void;
  onMessage: () => void;
  onSendBookingLink: () => void;
  onComplete: () => void;
  onNoShow: () => void;
  onCancel: () => void;
}

const formatDate = (iso: string): string => {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

/** "Today", "Tomorrow", "In 3 days" — only inside the next week. */
const countdownLabel = (dateIso: string): string | null => {
  const start = new Date(`${dateIso}T00:00:00`).getTime();
  if (!Number.isFinite(start)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((start - today.getTime()) / 864e5);
  if (days < 0 || days > 7) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
};

const statusLabel = (s: string): string =>
  s === "completed" ? "Completed" : s === "no_show" ? "No-show" : s === "cancelled" ? "Cancelled" : "Upcoming";

/**
 * The professional's mirror of the member appointment card — same anatomy
 * (date hero, person block, what it's for, where), plus the pro-only outcome
 * actions. Cancelling always routes through the parent so a reason can be
 * captured before the client is notified.
 */
const ProAppointmentCard = ({
  appointment: a,
  variant,
  busy,
  highlight,
  onOpenDetail,
  onMessage,
  onSendBookingLink,
  onComplete,
  onNoShow,
  onCancel,
}: Props) => {
  const isUpcoming = variant === "upcoming";
  const firstName = (a.client_display_name ?? "").split(/\s+/)[0] || "Client";
  const countdown = isUpcoming ? countdownLabel(a.appointment_date) : null;
  const formattedDate = formatDate(a.appointment_date);
  const formattedTime = a.appointment_time ? formatTime12h(a.appointment_time) : "";
  const description = appointmentPurpose(a);
  const venue = appointmentWhere(a);


  const calendarEvent: CalendarEvent = {
    title: `${firstName} — ${a.professional_type ?? "Appointment"}`,
    date: a.appointment_date,
    time: a.appointment_time,
    durationMinutes: 60,
    location: a.clinic_name,
    description: [a.reason, a.notes].filter(Boolean).join("\n\n") || undefined,
    uid: `pro-appt-${a.id}@strand.app`,
  };

  const PersonBlock = (
    <button
      type="button"
      onClick={onOpenDetail}
      aria-label={`Open ${firstName}'s appointment details`}
      className={cn(
        "flex items-center gap-3 mb-4 w-full text-left rounded-[14px] focus:outline-none focus:ring-2 transition-colors",
        isUpcoming ? "hover:bg-white/5 focus:ring-primary/40" : "hover:bg-muted/40 focus:ring-primary/30",
      )}
    >
      <ProAvatar
        name={firstName}
        photoUrl={a.client_avatar_url ?? undefined}
        size="size-12"
        className={cn(
          "rounded-[14px]",
          isUpcoming ? "bg-[#C5A059]/15 text-[#C5A059]" : "bg-muted text-muted-foreground",
        )}
      />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "font-display text-lg font-semibold leading-tight truncate",
            isUpcoming ? "text-white" : "text-foreground",
          )}
        >
          {firstName}
        </p>
        {description && (
          <p
            className={cn(
              "text-[12px] leading-snug font-body line-clamp-2",
              isUpcoming ? "text-white/90" : "text-foreground/85",
            )}
          >
            {description}
          </p>
        )}
        {venue && (
          <p
            className={cn(
              "text-[11px] truncate font-body",
              isUpcoming ? "text-[#E0D7CC]/70" : "text-muted-foreground",
            )}
          >
            {venue}
          </p>
        )}
        {!description && !venue && (
          <p className={cn("text-[11px] font-body", isUpcoming ? "text-[#E0D7CC]/70" : "text-muted-foreground")}>
            —
          </p>
        )}
      </div>
      <ChevronRight className={cn("size-4 shrink-0", isUpcoming ? "text-[#C5A059]" : "text-primary/70")} />
    </button>
  );

  if (isUpcoming) {
    return (
      <div
        id={`appt-${a.id}`}
        className={cn(
          "relative overflow-hidden rounded-[22px] border border-[#C5A059]/30 shadow-lg bg-[#4A3728]",
          highlight && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 bg-[#C5A059]/10 rounded-full blur-2xl" />
        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex flex-col items-start gap-0.5">
              <p className="text-[#C5A059]/80 text-[10px] uppercase tracking-[0.2em] font-semibold font-body">
                {a.professional_type ?? "Appointment"}
              </p>
              <p className="font-display text-white text-xl font-bold leading-tight tracking-tight">
                {formattedDate}
              </p>
              {formattedTime && (
                <p className="text-[#C5A059] text-[13px] font-bold font-body tracking-wide">{formattedTime}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="bg-emerald-500/90 text-white text-[10px] uppercase tracking-[0.15em] font-bold px-2.5 py-1 rounded-full">
                Booked
              </span>
              {countdown && (
                <span className="bg-[#C5A059]/15 text-[#C5A059] text-[10px] uppercase tracking-[0.15em] font-semibold px-2.5 py-1 rounded-full">
                  {countdown}
                </span>
              )}
            </div>
          </div>

          {PersonBlock}

          {a.notes && (
            <p className="text-[#E0D7CC]/90 text-[12px] leading-relaxed border-t border-white/10 pt-3 mb-4 font-body whitespace-pre-wrap">
              <span className="text-[#C5A059] font-semibold uppercase tracking-[0.12em] text-[10px]">
                Client's note·
              </span>{" "}
              {a.notes}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMessage}
              className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-full bg-white/10 text-[#F3ECE3] text-[11px] font-bold uppercase tracking-[0.15em] font-body hover:bg-white/15 transition-colors"
            >
              <MessageCircle className="size-3.5" />
              Message {firstName}
            </button>
            <AddToCalendarButton
              event={calendarEvent}
              label="Calendar"
              className="bg-[#C5A059]/10 text-[#C5A059] border border-[#C5A059]/20 hover:bg-[#C5A059]/20"
            />
          </div>

          <button
            type="button"
            onClick={onSendBookingLink}
            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-full border border-[#C5A059]/25 text-[#C5A059] text-[11px] font-bold uppercase tracking-[0.15em] font-body hover:bg-[#C5A059]/10 transition-colors"
          >
            <LinkIcon className="size-3.5" />
            Send booking link
          </button>

          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="text-[#C5A059]/70 text-[10px] uppercase tracking-[0.18em] font-semibold font-body mb-2">
              After the visit
            </p>
            <div className="space-y-2">
              <button
                type="button"
                disabled={busy}
                onClick={onComplete}
                className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-full bg-[#C5A059] text-white text-[12px] font-bold uppercase tracking-[0.12em] font-body hover:bg-[#D6AF6A] transition-colors disabled:opacity-60"
              >
                <Check className="size-4" />
                Mark completed
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onNoShow}
                className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-full bg-[#C5A059] text-white text-[12px] font-bold uppercase tracking-[0.12em] font-body hover:bg-[#D6AF6A] transition-colors disabled:opacity-60"
              >
                <AlertTriangle className="size-4" />
                Mark no-show
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onCancel}
                className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-full bg-destructive text-white text-[12px] font-bold uppercase tracking-[0.12em] font-body hover:bg-destructive/90 transition-colors disabled:opacity-60"
              >
                <XCircle className="size-4" />
                Cancel appointment
              </button>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Past / closed — muted treatment, mirroring the member's past card.
  return (
    <div
      id={`appt-${a.id}`}
      className={cn(
        "rounded-[22px] border border-border bg-secondary/70 shadow-sm",
        highlight && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex flex-col items-start gap-0.5">
            <p className="text-muted-foreground text-[10px] uppercase tracking-[0.2em] font-semibold font-body">
              {a.professional_type ?? "Appointment"}
            </p>
            <p className="font-display text-foreground text-lg font-bold leading-tight tracking-tight">
              {formattedDate}
            </p>
            {formattedTime && (
              <p className="text-foreground/80 text-[13px] font-bold font-body tracking-wide">{formattedTime}</p>
            )}
          </div>
          <span
            className={cn(
              "text-[10px] uppercase tracking-[0.15em] font-semibold px-2.5 py-1 rounded-full shrink-0",
              a.status === "completed"
                ? "bg-good/15 text-good"
                : a.status === "no_show"
                  ? "bg-alert-dark/15 text-alert-dark"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {statusLabel(a.status)}
          </span>
        </div>

        {PersonBlock}

        {(a.outcome_notes || a.notes || a.cancellation_reason) && (
          <div className="border-t border-border pt-3 mb-4 space-y-1">
            {a.cancellation_reason && (
              <p className="text-[11px] text-foreground/80 leading-relaxed font-body">
                <span className="font-semibold text-foreground">Cancellation reason:</span> {a.cancellation_reason}
              </p>
            )}
            {a.outcome_notes && (
              <p className="text-[11px] text-foreground/80 leading-relaxed font-body">
                <span className="font-semibold text-foreground">Your notes:</span> {a.outcome_notes}
              </p>
            )}
            {a.notes && (
              <p className="text-[11px] text-muted-foreground leading-relaxed font-body whitespace-pre-wrap">
                {a.notes}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMessage}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border border-foreground/20 bg-card text-foreground text-[11px] font-bold uppercase tracking-[0.15em] font-body hover:bg-muted transition-colors min-h-[40px]"
          >
            <MessageCircle className="size-3.5" />
            Message {firstName}
          </button>
          <button
            type="button"
            onClick={onOpenDetail}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border border-foreground/20 bg-card text-foreground text-[11px] font-bold uppercase tracking-[0.15em] font-body hover:bg-muted transition-colors min-h-[40px]"
          >
            Details
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProAppointmentCard;
