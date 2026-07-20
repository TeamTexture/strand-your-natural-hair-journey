import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ProAvatar from "@/components/ProAvatar";
import AddToCalendarButton from "@/components/AddToCalendarButton";
import type { CalendarEvent } from "@/lib/addToCalendar";
import { formatTime12h } from "@/lib/formatTime";

export interface AppointmentCardData {
  id: string;
  professional_name: string;
  professional_type: string | null;
  clinic_name: string | null;
  appointment_date: string;
  appointment_time: string | null;
  reason: string | null;
  notes: string | null;
  outcome_notes?: string | null;
  status: string;
}

interface Props {
  appointment: AppointmentCardData;
  variant: "upcoming" | "past";
  onEdit: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

const AppointmentCard = ({ appointment, variant, onEdit, onDelete, children }: Props) => {
  const isUpcoming = variant === "upcoming";

  const rawReason = appointment.reason ?? "";
  const isFollowUp = /^follow-?up\b/i.test(rawReason.trim());
  const upcomingReason = isFollowUp
    ? rawReason.replace(/^follow-?up\s*[:\-–]?\s*/i, "").trim() || "Follow-up"
    : rawReason.trim();

  // Extract "Previous reason: ..." carried forward in notes when the follow-up was scheduled.
  const previousReasonMatch = isFollowUp
    ? (appointment.notes ?? "").match(/Previous reason:\s*([^\n]+)/i)
    : null;
  const previousReason = previousReasonMatch?.[1]?.trim() || null;

  const dateTime = `${appointment.professional_type ?? "Appointment"} · ${formatDate(
    appointment.appointment_date,
  )}${appointment.appointment_time ? ` · ${appointment.appointment_time}` : ""}`;

  const subtitle =
    [appointment.clinic_name, isFollowUp ? null : appointment.reason].filter(Boolean).join(" · ") ||
    (isFollowUp ? appointment.clinic_name || "—" : "—");

  const calendarEvent: CalendarEvent = {
    title: `${appointment.professional_type ?? "Appointment"} — ${appointment.professional_name}`,
    date: appointment.appointment_date,
    time: appointment.appointment_time,
    durationMinutes: 60,
    location: appointment.clinic_name,
    description: [appointment.reason, appointment.notes].filter(Boolean).join("\n\n") || undefined,
    uid: `appt-${appointment.id}@strand.app`,
  };

  if (isUpcoming) {
    return (
      <div className="relative overflow-hidden rounded-[22px] border border-[#C5A059]/30 shadow-lg bg-[#4A3728]">
        <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 bg-[#C5A059]/10 rounded-full blur-2xl" />
        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <p className="text-[#C5A059] text-[10px] uppercase tracking-[0.2em] font-semibold font-body leading-relaxed">
              {dateTime}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {isFollowUp ? (
                <span className="bg-[#C5A059] text-[#2C2416] text-[10px] uppercase tracking-[0.15em] font-bold px-2.5 py-1 rounded-full">
                  Follow-up
                </span>
              ) : (
                <span className="bg-emerald-500/90 text-white text-[10px] uppercase tracking-[0.15em] font-bold px-2.5 py-1 rounded-full">
                  New
                </span>
              )}
              <span className="bg-[#C5A059]/15 text-[#C5A059] text-[10px] uppercase tracking-[0.15em] font-semibold px-2.5 py-1 rounded-full">
                Soon
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <ProAvatar
              name={appointment.professional_name}
              size="size-12"
              className="bg-[#C5A059]/15 text-[#C5A059] rounded-[14px]"
            />
            <div className="flex-1 min-w-0">
              <p className="font-display text-white text-lg font-semibold leading-tight truncate">
                {appointment.professional_name}
              </p>
              <p className="text-[#E0D7CC]/80 text-[12px] truncate font-body">{subtitle}</p>
            </div>
          </div>

          {isFollowUp && (previousReason || upcomingReason) && (
            <div className="border-t border-white/10 pt-3 mb-4 space-y-1.5">
              {previousReason && (
                <p className="text-[#E0D7CC]/85 text-[11px] leading-relaxed font-body">
                  <span className="text-[#C5A059] font-semibold uppercase tracking-[0.12em] text-[10px]">
                    Previous reason·
                  </span>{" "}
                  {previousReason}
                </p>
              )}
              {upcomingReason && (
                <p className="text-white/95 text-[12px] leading-relaxed font-body">
                  <span className="text-[#C5A059] font-semibold uppercase tracking-[0.12em] text-[10px]">
                    This visit·
                  </span>{" "}
                  {upcomingReason}
                </p>
              )}
            </div>
          )}

          {appointment.notes && !isFollowUp && (
            <p className="text-[#E0D7CC]/90 text-[12px] leading-relaxed border-t border-white/10 pt-3 mb-4 font-body">
              {appointment.notes}
            </p>
          )}

          {children}

          <div className="mt-4 flex items-center gap-2">
            <AddToCalendarButton
              event={calendarEvent}
              label="Calendar"
              className="bg-[#C5A059]/10 text-[#C5A059] border border-[#C5A059]/20 hover:bg-[#C5A059]/20"
            />
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-[#C5A059] text-[#2C2416] text-[11px] font-bold uppercase tracking-[0.15em] font-body hover:bg-[#D6AF6A] transition-colors min-h-[40px]"
              aria-label="Edit appointment"
            >
              <Pencil className="size-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-destructive/90 text-white text-[11px] font-bold uppercase tracking-[0.15em] font-body hover:bg-destructive transition-colors min-h-[40px]"
              aria-label="Delete appointment"
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Past appointment — muted grey treatment
  const statusLabel = appointment.status === "completed" ? "Completed" : "Past";

  return (
    <div className="rounded-[22px] border border-border bg-secondary/70 shadow-sm">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <p className="text-muted-foreground text-[10px] uppercase tracking-[0.2em] font-semibold font-body leading-relaxed">
            {dateTime}
          </p>
          <span
            className={cn(
              "text-[10px] uppercase tracking-[0.15em] font-semibold px-2.5 py-1 rounded-full shrink-0",
              appointment.status === "completed"
                ? "bg-good/15 text-good"
                : "bg-muted text-muted-foreground",
            )}
          >
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <ProAvatar
            name={appointment.professional_name}
            size="size-12"
            className="bg-muted text-muted-foreground rounded-[14px]"
          />
          <div className="flex-1 min-w-0">
            <p className="font-display text-foreground text-base font-semibold leading-tight truncate">
              {appointment.professional_name}
            </p>
            <p className="text-muted-foreground text-[12px] truncate font-body">{subtitle}</p>
          </div>
        </div>

        {(appointment.outcome_notes || appointment.notes) && (
          <div className="border-t border-border pt-3 mb-4 space-y-1">
            {appointment.outcome_notes && (
              <p className="text-[11px] text-foreground/80 leading-relaxed font-body">
                <span className="font-semibold text-foreground">How it went:</span> {appointment.outcome_notes}
              </p>
            )}
            {appointment.notes && (
              <p className="text-[11px] text-muted-foreground leading-relaxed font-body">{appointment.notes}</p>
            )}
          </div>
        )}

        {children}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border border-foreground/20 bg-card text-foreground text-[11px] font-bold uppercase tracking-[0.15em] font-body hover:bg-muted transition-colors min-h-[40px]"
            aria-label="Edit appointment"
          >
            <Pencil className="size-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-[11px] font-bold uppercase tracking-[0.15em] font-body hover:bg-destructive/20 transition-colors min-h-[40px]"
            aria-label="Delete appointment"
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppointmentCard;
