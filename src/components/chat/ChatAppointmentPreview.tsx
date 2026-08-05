import { useNavigate } from "react-router-dom";
import { Calendar, ChevronRight, MapPin } from "lucide-react";
import { formatTime12h } from "@/lib/formatTime";
import { appointmentPurpose, appointmentWhere } from "@/lib/appointmentDisplay";
import type { ThreadAppointment } from "@/hooks/useThreadAppointment";

const formatDate = (iso: string): string => {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
};

/** "Today", "Tomorrow", "In 4 days" — only inside the next week. */
const countdown = (iso: string): string | null => {
  const start = new Date(`${iso}T00:00:00`).getTime();
  if (!Number.isFinite(start)) return null;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const days = Math.round((start - t.getTime()) / 864e5);
  if (days < 0 || days > 7) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
};

/**
 * Pinned preview of the next booked appointment between the two people in a
 * thread. Same row on both sides — "See full details" simply routes each person
 * to their own dashboard, anchored on that appointment.
 */
const ChatAppointmentPreview = ({
  appointment: a,
  isPro,
  clientName,
}: {
  appointment: ThreadAppointment;
  isPro: boolean;
  clientName?: string | null;
}) => {
  const nav = useNavigate();
  const purpose = appointmentPurpose(a);
  const where = appointmentWhere(a);
  const soon = countdown(a.appointment_date);
  const who = isPro ? (clientName?.trim() || "your client") : (a.professional_name || "your professional");

  return (
    <div className="mx-4 mb-2 rounded-[16px] border border-primary/25 bg-primary/8 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[9.5px] font-body font-semibold uppercase tracking-[0.14em] text-primary">
          <Calendar className="size-3.5" />
          Booked appointment
        </span>
        {soon && (
          <span className="text-[9.5px] font-body font-semibold uppercase tracking-[0.12em] text-primary/80">
            {soon}
          </span>
        )}
      </div>

      <p className="mt-1.5 font-display text-base font-semibold leading-tight text-foreground">
        {formatDate(a.appointment_date)}
        {a.appointment_time ? ` · ${formatTime12h(a.appointment_time)}` : ""}
      </p>
      <p className="mt-0.5 text-[12.5px] font-body leading-snug text-foreground/85">
        {purpose ? `${purpose} with ${who}` : `With ${who}`}
      </p>
      {where && (
        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-body text-muted-foreground">
          <MapPin className="size-3" />
          {where}
        </p>
      )}

      <button
        type="button"
        onClick={() => nav(isPro ? `/pro/appointments?appt=${a.id}` : `/appointments?appt=${a.id}`)}
        className="mt-2.5 inline-flex min-h-[44px] w-full items-center justify-center gap-1 rounded-pill bg-primary px-4 text-[11.5px] font-body font-semibold uppercase tracking-[0.08em] text-primary-foreground"
      >
        See full details
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
};

export default ChatAppointmentPreview;
