// Blood tests hub — lists every blood test (logged + scheduled), shows a
// calendar with week/month/year zoom, and provides quick actions to add,
// edit, delete, or log results for scheduled tests.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  CalendarPlus,
  FlaskConical,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Upload,
} from "lucide-react";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { clearBloodDraft } from "@/hooks/useBloodValues";
import { BLOOD_RANGES } from "@/data/bloodRanges";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PanelStatus = "logged" | "scheduled";

interface PanelRow {
  id: string;
  panel_date: string | null;
  scheduled_at: string | null;
  status: PanelStatus;
  label: string | null;
  test_type: string | null;
  lab_name: string | null;
  notes: string | null;
}
interface ResultRow {
  marker: string;
  value: number | null;
  unit: string | null;
  status: string | null;
  panel_id: string | null;
}

type Zoom = "week" | "month" | "year";

const fmtDate = (iso: string | null) => {
  if (!iso) return "Undated";
  try {
    const d = parseISO(iso);
    return format(d, "d MMM yyyy");
  } catch {
    return iso;
  }
};

const displayDate = (p: PanelRow) => {
  const iso = p.status === "scheduled" ? p.scheduled_at ?? p.panel_date : p.panel_date;
  return iso ? fmtDate(iso) : "Undated";
};

const panelDateObj = (p: PanelRow): Date | null => {
  const iso = p.status === "scheduled" ? p.scheduled_at ?? p.panel_date : p.panel_date;
  if (!iso) return null;
  try {
    return parseISO(iso);
  } catch {
    return null;
  }
};

const BloodHistory = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [zoom, setZoom] = useState<Zoom>("month");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [editing, setEditing] = useState<PanelRow | null>(null);
  const [scheduling, setScheduling] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["blood-history", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data: panels } = await supabase
        .from("blood_panels" as never)
        .select("id, panel_date, scheduled_at, status, label, test_type, lab_name, notes")
        .eq("user_id", user!.id)
        .order("panel_date", { ascending: false })
        .order("created_at", { ascending: false });
      const panelRows = (panels ?? []) as unknown as PanelRow[];
      if (panelRows.length === 0) return { panels: [], results: [] as ResultRow[] };
      const { data: results } = await supabase
        .from("blood_results")
        .select("marker, value, unit, status, panel_id")
        .eq("user_id", user!.id)
        .in("panel_id" as never, panelRows.map((p) => p.id) as never);
      return { panels: panelRows, results: (results ?? []) as unknown as ResultRow[] };
    },
  });

  const panels = data?.panels ?? [];
  const results = data?.results ?? [];

  const rowsByPanel = useMemo(() => {
    const m = new Map<string, ResultRow[]>();
    for (const r of results) {
      const key = String(r.panel_id ?? "");
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return m;
  }, [results]);

  const scheduled = panels.filter((p) => p.status === "scheduled");
  const logged = panels.filter((p) => p.status !== "scheduled");
  const latest = logged[0];
  const previous = logged[1];

  const deltas = useMemo(() => {
    if (!latest || !previous) return [];
    const cur = rowsByPanel.get(latest.id) ?? [];
    const prev = rowsByPanel.get(previous.id) ?? [];
    const prevByMarker = new Map(prev.map((r) => [r.marker, r]));
    return cur
      .map((r) => {
        const p = prevByMarker.get(r.marker);
        if (!p || p.value == null || r.value == null) return null;
        const diff = Number(r.value) - Number(p.value);
        return {
          marker: r.marker,
          unit: r.unit ?? BLOOD_RANGES[r.marker]?.unit ?? "",
          previous: Number(p.value),
          current: Number(r.value),
          diff,
          prevStatus: p.status,
          curStatus: r.status,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 6);
  }, [latest, previous, rowsByPanel]);

  const startNew = () => {
    clearBloodDraft();
    navigate("/onboarding/blood-timing");
  };

  const logScheduled = (p: PanelRow) => {
    // Attach the onboarding flow to this existing scheduled panel by seeding
    // the draft-panel pointer and marking it as logged first.
    clearBloodDraft();
    localStorage.setItem("strand_blood_draft_panel_id", p.id);
    if (p.scheduled_at) {
      localStorage.setItem(
        "strand_blood_draft_panel_date",
        p.scheduled_at.slice(0, 10),
      );
    }
    // Flip status to logged; keep panel_date as the scheduled date for chronology.
    supabase
      .from("blood_panels" as never)
      .update({
        status: "logged" as never,
        panel_date: (p.scheduled_at?.slice(0, 10) ?? p.panel_date) as never,
      } as never)
      .eq("id", p.id)
      .then(() => qc.invalidateQueries({ queryKey: ["blood-history"] }));
    navigate("/onboarding/blood-timing");
  };

  const deletePanel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("blood_panels" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Blood test deleted");
      qc.invalidateQueries({ queryKey: ["blood-history"] });
      setEditing(null);
    },
    onError: () => toast.error("Couldn't delete — try again"),
  });

  // ------- Calendar range -------
  const range = useMemo(() => {
    if (zoom === "week") {
      return { start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) };
    }
    if (zoom === "month") {
      return { start: startOfMonth(cursor), end: endOfMonth(cursor) };
    }
    return { start: startOfYear(cursor), end: endOfYear(cursor) };
  }, [zoom, cursor]);

  const shift = (dir: -1 | 1) => {
    if (zoom === "week") setCursor((c) => addWeeks(c, dir));
    else if (zoom === "month") setCursor((c) => addMonths(c, dir));
    else setCursor((c) => addYears(c, dir));
  };

  const rangeLabel = useMemo(() => {
    if (zoom === "week") return `${format(range.start, "d MMM")} – ${format(range.end, "d MMM yyyy")}`;
    if (zoom === "month") return format(cursor, "MMMM yyyy");
    return format(cursor, "yyyy");
  }, [zoom, range, cursor]);

  return (
    <ScreenLayout>
      <TitleBar title="Blood tests" onBack={() => navigate("/profile")} />
      <div className="px-5 pt-2 pb-10 space-y-4">
        <p className="text-sm text-foreground/80 font-body leading-relaxed">
          Log every blood test and schedule the next one so STRAND can track how
          your markers move over time.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="gold" size="pill" onClick={startNew} className="w-full">
            <Plus className="size-4" />
            Add test
          </Button>
          <Button
            variant="outline"
            size="pill"
            onClick={() => setScheduling(true)}
            className="w-full"
          >
            <CalendarPlus className="size-4" />
            Schedule
          </Button>
          <Button
            variant="outline"
            size="pill"
            onClick={() => navigate("/blood-upload")}
            className="w-full col-span-2"
          >
            <Upload className="size-4" />
            Upload PDF or photo
          </Button>
        </div>


        {/* Calendar */}
        <SurfaceCard>
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => shift(-1)}
              className="size-8 rounded-full hover:bg-muted flex items-center justify-center"
              aria-label="Previous"
            >
              <ChevronLeft className="size-4" />
            </button>
            <p className="text-sm font-body font-semibold">{rangeLabel}</p>
            <button
              onClick={() => shift(1)}
              className="size-8 rounded-full hover:bg-muted flex items-center justify-center"
              aria-label="Next"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="flex gap-1 mb-3 rounded-full bg-muted p-1">
            {(["week", "month", "year"] as Zoom[]).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={cn(
                  "flex-1 text-xs font-body py-1.5 rounded-full capitalize transition",
                  zoom === z ? "bg-background shadow-sm font-semibold" : "text-muted-foreground",
                )}
              >
                {z}
              </button>
            ))}
          </div>

          <CalendarBody zoom={zoom} cursor={cursor} panels={panels} onJump={setCursor} />

          <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground font-body">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-primary" /> Logged
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-warn" /> Scheduled
            </span>
          </div>
        </SurfaceCard>

        {/* Scheduled */}
        {scheduled.length > 0 && (
          <>
            <SectionLabel>Upcoming</SectionLabel>
            <div className="space-y-2">
              {scheduled.map((p) => (
                <div
                  key={p.id}
                  className="bg-card border border-warn/40 rounded-[14px] p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-body font-semibold flex items-center gap-2">
                        <Clock className="size-4 text-warn" />
                        {displayDate(p)}
                      </p>
                      <p className="text-xs text-muted-foreground font-body mt-0.5">
                        {p.label ?? "Scheduled blood test"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditing(p)}
                        className="size-8 rounded-full hover:bg-muted flex items-center justify-center"
                        aria-label="Edit"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </div>
                  </div>
                  <Button
                    variant="gold"
                    size="pill"
                    className="w-full mt-3"
                    onClick={() => logScheduled(p)}
                  >
                    <CheckCircle2 className="size-4" />
                    Log results
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Movement */}
        {deltas.length > 0 && (
          <>
            <SectionLabel>Movement since your last test</SectionLabel>
            <SurfaceCard padded={false}>
              <ul className="divide-y divide-border/60">
                {deltas.map((d) => {
                  const up = d.diff > 0;
                  const flat = d.diff === 0;
                  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
                  const tone = flat
                    ? "text-muted-foreground"
                    : d.curStatus === "normal" && d.prevStatus !== "normal"
                      ? "text-good"
                      : d.curStatus && d.curStatus !== "normal" && d.prevStatus === "normal"
                        ? "text-warn"
                        : "text-foreground/80";
                  return (
                    <li key={d.marker} className="flex items-center gap-3 px-4 py-3">
                      <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <FlaskConical className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-body font-medium truncate">{d.marker}</p>
                        <p className="text-xs text-muted-foreground font-body">
                          {d.previous} → {d.current} {d.unit}
                        </p>
                      </div>
                      <span className={`flex items-center gap-1 text-xs font-body ${tone}`}>
                        <Icon className="size-4" />
                        {flat ? "no change" : `${up ? "+" : ""}${d.diff.toFixed(1)}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </SurfaceCard>
          </>
        )}

        {/* All logged tests */}
        <SectionLabel>All tests</SectionLabel>
        {isLoading ? (
          <SurfaceCard>
            <p className="text-sm font-body text-muted-foreground">Loading…</p>
          </SurfaceCard>
        ) : logged.length === 0 ? (
          <SurfaceCard>
            <p className="text-sm font-body">
              No blood tests logged yet. Tap <em>Add test</em> to add your first one.
            </p>
          </SurfaceCard>
        ) : (
          <div className="space-y-2">
            {logged.map((p, idx) => {
              const rows = rowsByPanel.get(p.id) ?? [];
              const flagged = rows.filter((r) => r.status === "low" || r.status === "high");
              const preview = flagged.length > 0 ? flagged.slice(0, 3) : rows.slice(0, 3);
              const isOpen = expanded.has(p.id);
              return (
                <div
                  key={p.id}
                  className="bg-card border border-border rounded-[14px] p-3.5"
                >
                  <button
                    onClick={() => {
                      setExpanded((s) => {
                        const n = new Set(s);
                        if (n.has(p.id)) n.delete(p.id);
                        else n.add(p.id);
                        return n;
                      });
                    }}
                    className="w-full flex items-start gap-3 text-left"
                  >
                    <div className="size-11 rounded-[12px] bg-primary/10 text-primary flex flex-col items-center justify-center shrink-0">
                      <FlaskConical className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-body font-semibold flex items-center gap-2 truncate">
                        <span className="truncate">{p.label ?? "Blood test"}</span>
                        {idx === 0 && (
                          <span className="text-[10px] tracking-[0.2em] uppercase text-primary shrink-0">
                            Latest
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground font-body mt-0.5">
                        {displayDate(p)} · {rows.length} markers
                        {flagged.length > 0 ? ` · ${flagged.length} flagged` : ""}
                      </p>
                      {preview.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {preview.map((r) => (
                            <span
                              key={r.marker}
                              className={cn(
                                "text-[10px] font-body px-2 py-0.5 rounded-full border",
                                r.status === "low" || r.status === "high"
                                  ? "border-warn/40 bg-warn/10 text-warn"
                                  : "border-border bg-muted text-foreground/70",
                              )}
                            >
                              {r.marker} {r.value ?? "–"}
                              {r.unit ? ` ${r.unit}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(p);
                      }}
                      className="size-8 rounded-full hover:bg-muted flex items-center justify-center shrink-0"
                      aria-label="Edit"
                    >
                      <Pencil className="size-4" />
                    </button>
                  </button>

                  {isOpen && rows.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-1">
                      {rows.map((r) => (
                        <div
                          key={r.marker}
                          className="flex items-center justify-between text-xs font-body"
                        >
                          <span className="text-foreground/80">{r.marker}</span>
                          <span
                            className={cn(
                              "font-medium",
                              r.status === "low" || r.status === "high"
                                ? "text-warn"
                                : "text-foreground",
                            )}
                          >
                            {r.value ?? "–"} {r.unit ?? ""}
                          </span>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="pill"
                        className="w-full mt-3"
                        onClick={() => {
                          clearBloodDraft();
                          localStorage.setItem("strand_blood_draft_panel_id", p.id);
                          if (p.panel_date)
                            localStorage.setItem(
                              "strand_blood_draft_panel_date",
                              p.panel_date,
                            );
                          navigate("/onboarding/blood-iron-vitamins");
                        }}
                      >
                        Edit values
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <EditPanelSheet
        panel={editing}
        onClose={() => setEditing(null)}
        onDelete={(id) => deletePanel.mutate(id)}
        deleting={deletePanel.isPending}
        onSaved={() => qc.invalidateQueries({ queryKey: ["blood-history"] })}
      />

      <SchedulePanelSheet
        open={scheduling}
        onClose={() => setScheduling(false)}
        userId={user?.id ?? null}
        onSaved={() => qc.invalidateQueries({ queryKey: ["blood-history"] })}
      />
    </ScreenLayout>
  );
};

// ---------- Calendar body ----------
function CalendarBody({
  zoom,
  cursor,
  panels,
  onJump,
}: {
  zoom: Zoom;
  cursor: Date;
  panels: PanelRow[];
  onJump: (d: Date) => void;
}) {
  const dots = useMemo(() => {
    const m = new Map<string, PanelStatus[]>();
    for (const p of panels) {
      const d = panelDateObj(p);
      if (!d) continue;
      const key = format(d, "yyyy-MM-dd");
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p.status);
    }
    return m;
  }, [panels]);

  if (zoom === "week") {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return (
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const statuses = dots.get(key) ?? [];
          return (
            <div key={key} className="flex flex-col items-center gap-1 py-2 rounded-lg bg-muted/40">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {format(d, "EEE")}
              </span>
              <span className={cn("text-sm font-body", isSameDay(d, new Date()) && "font-bold text-primary")}>
                {format(d, "d")}
              </span>
              <div className="flex gap-0.5 min-h-[6px]">
                {statuses.slice(0, 3).map((s, i) => (
                  <span
                    key={i}
                    className={cn(
                      "size-1.5 rounded-full",
                      s === "scheduled" ? "bg-warn" : "bg-primary",
                    )}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (zoom === "month") {
    const monthStart = startOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    return (
      <>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i} className="text-center text-[10px] text-muted-foreground uppercase">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const statuses = dots.get(key) ?? [];
            const inMonth = isSameMonth(d, cursor);
            const today = isSameDay(d, new Date());
            return (
              <div
                key={key}
                className={cn(
                  "aspect-square flex flex-col items-center justify-center rounded-lg text-xs relative",
                  inMonth ? "bg-muted/40" : "bg-transparent text-muted-foreground/50",
                  today && "ring-1 ring-primary",
                )}
              >
                <span className={cn(today && "font-bold text-primary")}>{format(d, "d")}</span>
                <div className="flex gap-0.5 absolute bottom-1">
                  {statuses.slice(0, 3).map((s, i) => (
                    <span
                      key={i}
                      className={cn(
                        "size-1 rounded-full",
                        s === "scheduled" ? "bg-warn" : "bg-primary",
                      )}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // Year view — 12 mini-cells
  const yearStart = startOfYear(cursor);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(yearStart, i));
  return (
    <div className="grid grid-cols-3 gap-2">
      {months.map((m) => {
        const monthEnd = endOfMonth(m);
        let logged = 0;
        let scheduledN = 0;
        for (const p of panels) {
          const d = panelDateObj(p);
          if (!d) continue;
          if (isWithinInterval(d, { start: m, end: monthEnd })) {
            if (p.status === "scheduled") scheduledN += 1;
            else logged += 1;
          }
        }
        return (
          <button
            key={m.toISOString()}
            onClick={() => onJump(m)}
            className="flex flex-col items-center py-3 rounded-lg bg-muted/40 hover:bg-muted"
          >
            <span className="text-xs font-body font-semibold">{format(m, "MMM")}</span>
            <div className="flex gap-1 mt-1 min-h-[8px]">
              {logged > 0 && (
                <span className="text-[10px] px-1.5 rounded-full bg-primary/20 text-primary">
                  {logged}
                </span>
              )}
              {scheduledN > 0 && (
                <span className="text-[10px] px-1.5 rounded-full bg-warn/20 text-warn">
                  {scheduledN}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Edit sheet ----------
function EditPanelSheet({
  panel,
  onClose,
  onDelete,
  deleting,
  onSaved,
}: {
  panel: PanelRow | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  deleting: boolean;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(panel?.label ?? "");
  const [dateStr, setDateStr] = useState(
    (panel?.status === "scheduled" ? panel?.scheduled_at : panel?.panel_date)?.slice(0, 10) ?? "",
  );
  const [notes, setNotes] = useState(panel?.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Reset state when panel changes
  useMemo(() => {
    setLabel(panel?.label ?? "");
    setDateStr(
      (panel?.status === "scheduled" ? panel?.scheduled_at : panel?.panel_date)?.slice(0, 10) ?? "",
    );
    setNotes(panel?.notes ?? "");
  }, [panel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!panel) return;
    setSaving(true);
    const update: Record<string, unknown> = { label: label || null, notes: notes || null };
    if (dateStr) {
      if (panel.status === "scheduled") {
        update.scheduled_at = new Date(`${dateStr}T09:00:00`).toISOString();
      } else {
        update.panel_date = dateStr;
      }
    }
    const { error } = await supabase
      .from("blood_panels" as never)
      .update(update as never)
      .eq("id", panel.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save changes");
      return;
    }
    toast.success("Saved");
    onSaved();
    onClose();
  };

  return (
    <Sheet open={!!panel} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-[24px]">
        <SheetHeader>
          <SheetTitle>Edit blood test</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 py-4">
          <div>
            <Label htmlFor="edit-date" className="text-xs">
              Date
            </Label>
            <Input
              id="edit-date"
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-label" className="text-xs">
              Label
            </Label>
            <Input
              id="edit-label"
              placeholder="e.g. Annual check, Post-supplement"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-notes" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="edit-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <SheetFooter className="flex-col gap-2 sm:flex-col">
          <Button variant="gold" size="pill" onClick={save} disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            size="pill"
            onClick={() => panel && onDelete(panel.id)}
            disabled={deleting}
            className="w-full text-warn border-warn/40 hover:bg-warn/10"
          >
            <Trash2 className="size-4" />
            {deleting ? "Deleting…" : "Delete test"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Schedule sheet ----------
function SchedulePanelSheet({
  open,
  onClose,
  userId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  onSaved: () => void;
}) {
  const defaultDate = format(addDays(new Date(), 30), "yyyy-MM-dd");
  const [dateStr, setDateStr] = useState(defaultDate);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!userId || !dateStr) return;
    setSaving(true);
    const scheduledIso = new Date(`${dateStr}T09:00:00`).toISOString();
    const { error } = await supabase.from("blood_panels" as never).insert({
      user_id: userId,
      panel_date: dateStr,
      scheduled_at: scheduledIso,
      status: "scheduled",
      label: label || "Scheduled blood test",
    } as never);
    setSaving(false);
    if (error) {
      toast.error("Couldn't schedule — try again");
      return;
    }
    toast.success("Blood test scheduled");
    onSaved();
    setLabel("");
    setDateStr(defaultDate);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-[24px]">
        <SheetHeader>
          <SheetTitle>Schedule a future test</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 py-4">
          <div>
            <Label htmlFor="sched-date" className="text-xs">
              Date
            </Label>
            <Input
              id="sched-date"
              type="date"
              value={dateStr}
              min={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setDateStr(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sched-label" className="text-xs">
              Label (optional)
            </Label>
            <Input
              id="sched-label"
              placeholder="e.g. GP follow-up"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground font-body">
            You'll see this in your calendar. When you get results, tap
            <em> Log results</em> on the upcoming card to fill them in.
          </p>
        </div>
        <SheetFooter>
          <Button variant="gold" size="pill" onClick={save} disabled={saving} className="w-full">
            {saving ? "Scheduling…" : "Schedule test"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default BloodHistory;
