import { smartBack } from "@/lib/smartBack";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  ChevronRight,
  Check,
  XCircle,
  AlertTriangle,
  List as ListIcon,
  ChevronLeft,
} from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { supabase } from "@/integrations/supabase/client";
import { useProAppointments, type ProAppointmentRow } from "@/hooks/useProAppointments";
import { formatTime12h } from "@/lib/formatTime";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

const formatDayLong = (iso: string): string => {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
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

/** Build a `yyyy-mm-dd` matching what `appointments.appointment_date` stores. */
const toIsoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Build 6×7 grid of dates for a given month, week starting Monday. */
const buildMonthGrid = (year: number, monthIdx: number): Date[] => {
  const first = new Date(year, monthIdx, 1);
  const jsDow = first.getDay(); // 0..6 (Sun..Sat)
  const monOffset = (jsDow + 6) % 7; // days from Monday back
  const start = new Date(year, monthIdx, 1 - monOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

const ProAppointments = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data = [], isLoading } = useProAppointments();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const focusApptId = useSearchParams()[0].get("appt");

  // Scroll & pulse the appointment referenced by ?appt=<id>.
  useEffect(() => {
    if (!focusApptId || isLoading) return;
    // If the row is in past, switch tab so it's rendered.
    const row = data.find((x) => x.id === focusApptId);
    if (row) {
      const today = new Date().toISOString().slice(0, 10);
      setTab(row.appointment_date >= today ? "upcoming" : "past");
      setView("list");
    }
    const t = window.setTimeout(() => {
      const el = document.getElementById(`appt-${focusApptId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => window.clearTimeout(t);
  }, [focusApptId, isLoading, data]);



  const today = new Date().toISOString().slice(0, 10);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

  // { "yyyy-mm-dd": ProAppointmentRow[] } for O(1) day lookups in the grid.
  const byDay = useMemo(() => {
    const m = new Map<string, ProAppointmentRow[]>();
    for (const a of data) {
      const key = a.appointment_date;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(a);
    }
    for (const [k, arr] of m) {
      arr.sort((x, y) => (x.appointment_time ?? "").localeCompare(y.appointment_time ?? ""));
      m.set(k, arr);
    }
    return m;
  }, [data]);

  const selectedDayRows = selectedDay ? byDay.get(selectedDay) ?? [] : [];

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
    const highlight = focusApptId === a.id;
    return (
      <div
        key={a.id}
        id={`appt-${a.id}`}
        className={`rounded-[14px] border border-border bg-card p-4 space-y-3 transition ${highlight ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
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
          <div className="flex flex-col gap-2 pt-1">
            <Button
              disabled={busyId === a.id}
              onClick={() => updateStatus(a.id, "completed")}
              className="w-full h-11 text-[14px] font-body font-semibold uppercase tracking-[0.08em]"
            >
              <Check className="size-4 mr-2" /> Mark completed
            </Button>
            <Button
              disabled={busyId === a.id}
              onClick={() => updateStatus(a.id, "no_show")}
              className="w-full h-11 text-[14px] font-body font-semibold uppercase tracking-[0.08em]"
            >
              <AlertTriangle className="size-4 mr-2" /> Mark no-show
            </Button>
            <Button
              disabled={busyId === a.id}
              onClick={() => setConfirmCancelId(a.id)}
              className="w-full h-11 text-[14px] font-body font-semibold uppercase tracking-[0.08em]"
            >
              <XCircle className="size-4 mr-2" /> Cancel
            </Button>
          </div>
        )}

      </div>
    );
  };

  const list = tab === "upcoming" ? upcoming : past;
  const grid = buildMonthGrid(monthCursor.year, monthCursor.month);
  const todayIso = toIsoDate(new Date());

  return (
    <ScreenLayout>
      <TitleBar title="Appointments" onBack={smartBack(nav, "/pro")} />
      <div className="px-5 pb-8 space-y-4">
        <p className="text-[12px] text-muted-foreground font-body leading-snug">
          Appointments your clients have linked to you. Access is gated by their consent.
        </p>

        {/* View toggle: List / Calendar */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-secondary/60 border border-border w-full">
          {(
            [
              { key: "list" as const, label: "List", Icon: ListIcon },
              { key: "calendar" as const, label: "Calendar", Icon: CalendarIcon },
            ]
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                "flex-1 h-9 rounded-full text-[12px] font-body font-medium transition-colors inline-flex items-center justify-center gap-1.5",
                view === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <LoadingDot label="Loading appointments…" fullScreen={false} />
        ) : view === "calendar" ? (
          <>
            {/* Month navigation */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() =>
                  setMonthCursor((c) => {
                    const d = new Date(c.year, c.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
                className="size-9 rounded-full border border-border flex items-center justify-center text-foreground/80 hover:bg-secondary/60"
              >
                <ChevronLeft className="size-4" />
              </button>
              <p className="font-display text-base font-semibold">
                {MONTH_LABELS[monthCursor.month]} {monthCursor.year}
              </p>
              <button
                type="button"
                aria-label="Next month"
                onClick={() =>
                  setMonthCursor((c) => {
                    const d = new Date(c.year, c.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
                className="size-9 rounded-full border border-border flex items-center justify-center text-foreground/80 hover:bg-secondary/60"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            {/* Day-of-week header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-body uppercase tracking-[0.14em] text-muted-foreground">
              {DOW_MON_FIRST.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-1">
              {grid.map((d) => {
                const iso = toIsoDate(d);
                const rows = byDay.get(iso) ?? [];
                const count = rows.length;
                const inMonth = d.getMonth() === monthCursor.month;
                const isToday = iso === todayIso;
                const isPast = iso < todayIso;
                const hasUpcoming = rows.some(
                  (r) => !["completed", "cancelled", "no_show"].includes(r.status),
                );
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => count > 0 && setSelectedDay(iso)}
                    disabled={count === 0}
                    aria-label={`${formatDayLong(iso)}${count > 0 ? `, ${count} appointment${count === 1 ? "" : "s"}` : ""}`}
                    className={cn(
                      "aspect-square rounded-[10px] border text-[12px] font-body relative flex flex-col items-center justify-center transition-colors",
                      inMonth ? "text-foreground" : "text-muted-foreground/50",
                      count > 0
                        ? hasUpcoming && !isPast
                          ? "bg-primary/15 border-primary/40 hover:bg-primary/25"
                          : "bg-secondary/60 border-border hover:bg-secondary"
                        : "bg-card border-border/60 cursor-default",
                      isToday && "ring-1 ring-primary/60",
                    )}
                  >
                    <span className={cn("leading-none", isToday && "font-semibold")}>
                      {d.getDate()}
                    </span>
                    {count > 0 && (
                      <span className="absolute bottom-1 inline-flex items-center gap-0.5">
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            hasUpcoming && !isPast ? "bg-primary" : "bg-muted-foreground/60",
                          )}
                        />
                        {count > 1 && (
                          <span className="text-[9px] leading-none text-foreground/70">
                            {count}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 text-[10px] font-body text-muted-foreground pt-1">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-primary" /> Upcoming
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-muted-foreground/60" /> Past / closed
              </span>
              <span className="inline-flex items-center gap-1 ml-auto">
                <span className="size-2 rounded-full ring-1 ring-primary/60" /> Today
              </span>
            </div>
          </>
        ) : (
          <>
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

            {list.length === 0 ? (
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
          </>
        )}
      </div>

      {/* Day-detail sheet triggered by tapping a marked calendar day. */}
      <Sheet open={!!selectedDay} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <SheetContent side="bottom" className="rounded-t-[20px] max-h-[80vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display text-lg">
              {selectedDay ? formatDayLong(selectedDay) : ""}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-2 pb-4">
            {selectedDayRows.length === 0 ? (
              <p className="text-[12px] text-muted-foreground font-body">
                No appointments on this day.
              </p>
            ) : (
              selectedDayRows.map((a) => {
                const meta = statusMeta(a.status);
                const firstName =
                  (a.client_display_name ?? "").split(/\s+/)[0] || "Client";
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setSelectedDay(null);
                      nav(`/pro/clients/${a.user_id}`);
                    }}
                    className="w-full flex items-center gap-3 rounded-[12px] border border-border bg-card p-3 text-left hover:border-primary/50"
                  >
                    <ProAvatar
                      name={firstName}
                      photoUrl={a.client_avatar_url ?? undefined}
                      size="size-9"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-sm font-semibold leading-tight truncate">
                        {firstName}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {a.appointment_time ? `${formatTime12h(a.appointment_time)} · ` : ""}
                        {a.reason || a.clinic_name || "Appointment"}
                      </p>
                    </div>
                    <span
                      className={`text-[9px] uppercase tracking-[0.14em] font-body px-1.5 py-0.5 rounded-full border ${meta.tone}`}
                    >
                      {meta.label}
                    </span>
                    <ChevronRight className="size-4 text-primary/70 shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!confirmCancelId}
        onOpenChange={(o) => !o && setConfirmCancelId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the appointment as cancelled for you and your client. You can't undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep appointment</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmCancelId) {
                  const id = confirmCancelId;
                  setConfirmCancelId(null);
                  updateStatus(id, "cancelled");
                }
              }}
            >
              Cancel appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>

  );
};

export default ProAppointments;
