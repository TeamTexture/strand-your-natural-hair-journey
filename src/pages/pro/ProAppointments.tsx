import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar as CalendarIcon, ChevronRight, Check, XCircle, AlertTriangle } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProAppointments, type ProAppointmentRow } from "@/hooks/useProAppointments";
import { formatTime12h } from "@/lib/formatTime";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

const statusMeta = (s: string) => {
  switch (s) {
    case "completed":
      return { label: "Completed", tone: "bg-good/20 text-good border-good/40" };
    case "cancelled":
      return { label: "Cancelled", tone: "bg-muted text-muted-foreground border-border" };
    case "no_show":
      return { label: "No-show", tone: "bg-alert-dark/20 text-alert-dark border-alert-dark/40" };
    default:
      return { label: "Upcoming", tone: "bg-primary/15 text-primary border-primary/30" };
  }
};

const ProAppointments = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data = [], isLoading } = useProAppointments();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const upcoming = useMemo(
    () =>
      data
        .filter(
          (a) =>
            !["completed", "cancelled", "no_show"].includes(a.status) &&
            a.appointment_date >= today,
        )
        .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date)),
    [data, today],
  );

  const past = useMemo(
    () =>
      data
        .filter(
          (a) =>
            ["completed", "cancelled", "no_show"].includes(a.status) ||
            a.appointment_date < today,
        )
        .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date)),
    [data, today],
  );

  const updateStatus = async (id: string, next: "completed" | "no_show" | "cancelled") => {
    setBusyId(id);
    const { error } = await supabase
      .from("appointments")
      .update({ status: next })
      .eq("id", id);
    setBusyId(null);
    if (error) {
      console.error("Pro appointment status update failed:", error);
      toast.error("Could not update status");
      return;
    }
    toast.success(
      next === "completed" ? "Marked completed" : next === "no_show" ? "Marked no-show" : "Marked cancelled",
    );
    qc.invalidateQueries({ queryKey: ["pro-appointments"] });
  };

  const renderCard = (a: ProAppointmentRow, variant: "upcoming" | "past") => {
    const meta = statusMeta(a.status);
    const firstName = (a.client_display_name ?? "").split(/\s+/)[0] || "Client";
    return (
      <div
        key={a.id}
        className="rounded-[14px] border border-border bg-card p-4 space-y-3"
      >
        <button
          type="button"
          onClick={() => nav(`/pro/clients/${a.user_id}`)}
          className="w-full flex items-center gap-3 text-left"
        >
          <ProAvatar name={firstName} photoUrl={a.client_avatar_url ?? undefined} size="size-10" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-base font-semibold leading-tight truncate">
              {firstName}
            </p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {formatDate(a.appointment_date)}
              {a.appointment_time ? ` · ${formatTime12h(a.appointment_time)}` : ""}
            </p>
          </div>
          <span
            className={`text-[10px] uppercase tracking-[0.14em] font-body px-2 py-1 rounded-full border ${meta.tone}`}
          >
            {meta.label}
          </span>
          <ChevronRight className="size-4 text-primary/70 shrink-0" />
        </button>

        {(a.clinic_name || a.reason) && (
          <div className="text-[12px] text-foreground/80 space-y-0.5">
            {a.clinic_name && <p><span className="text-muted-foreground">Location:</span> {a.clinic_name}</p>}
            {a.reason && <p><span className="text-muted-foreground">Reason:</span> {a.reason}</p>}
          </div>
        )}

        {a.notes && (
          <p className="text-[12px] text-foreground/75 leading-snug whitespace-pre-wrap border-t border-border/60 pt-2">
            {a.notes}
          </p>
        )}

        {variant === "upcoming" && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={busyId === a.id}
              onClick={() => updateStatus(a.id, "completed")}
              className="flex-1 h-9 text-[11px]"
            >
              <Check className="size-3.5 mr-1" /> Completed
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busyId === a.id}
              onClick={() => updateStatus(a.id, "no_show")}
              className="flex-1 h-9 text-[11px]"
            >
              <AlertTriangle className="size-3.5 mr-1" /> No-show
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busyId === a.id}
              onClick={() => updateStatus(a.id, "cancelled")}
              className="flex-1 h-9 text-[11px]"
            >
              <XCircle className="size-3.5 mr-1" /> Cancel
            </Button>
          </div>
        )}
      </div>
    );
  };

  const list = tab === "upcoming" ? upcoming : past;

  return (
    <ScreenLayout>
      <TitleBar title="Appointments" onBack={() => nav("/pro")} />
      <div className="px-5 pb-8 space-y-4">
        <p className="text-[12px] text-muted-foreground font-body leading-snug">
          Appointments your clients have linked to you. Access is gated by their consent.
        </p>

        <div className="flex items-center gap-1 p-1 rounded-full bg-secondary/60 border border-border w-full">
          {(["upcoming", "past"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 h-9 rounded-full text-[12px] font-body font-medium capitalize transition-colors ${
                tab === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {k} {k === "upcoming" ? `(${upcoming.length})` : `(${past.length})`}
            </button>
          ))}
        </div>

        {isLoading ? (
          <LoadingDot label="Loading appointments…" fullScreen={false} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="📅"
            message={tab === "upcoming" ? "No upcoming appointments" : "No past appointments"}
            hint={
              tab === "upcoming"
                ? "When a client logs a booking with you, it'll appear here."
                : "Completed, cancelled and no-show visits will land here."
            }
          />
        ) : (
          <>
            {tab === "upcoming" && upcoming.length > 0 && (
              <>
                <SectionLabel>Soonest first</SectionLabel>
                <div className="space-y-3">
                  {upcoming.map((a) => renderCard(a, "upcoming"))}
                </div>
              </>
            )}
            {tab === "past" && past.length > 0 && (
              <>
                <SectionLabel>Most recent first</SectionLabel>
                <div className="space-y-3">
                  {past.map((a) => renderCard(a, "past"))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default ProAppointments;
