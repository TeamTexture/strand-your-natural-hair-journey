// Blood Panel Review — read-only curated view of a single blood test.
//
// Rules (per product spec):
//  - Data is pulled directly from what was uploaded and cannot be edited here.
//  - Users can DELETE a panel but not change individual values.
//  - Markers are grouped by category and each row expands to a plain-English
//    explanation of what the marker is and why it matters for hair.
//  - Header clearly states test name, test type, lab/brand and date.
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Info,
  Trash2,
  Building2,
  BadgeCheck,
} from "lucide-react";

import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/hooks/useAuth";
import { BLOOD_RANGES, statusLabel, type BloodStatus } from "@/data/bloodRanges";
import { useBloodPanelThumb } from "@/hooks/useBloodPanelThumbs";
import {
  MARKER_EXPLANATIONS,
  CATEGORY_META,
} from "@/data/bloodMarkerExplanations";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PanelRow {
  id: string;
  user_id: string;
  panel_date: string | null;
  scheduled_at: string | null;
  status: string | null;
  label: string | null;
  test_type: string | null;
  lab_name: string | null;
  thumbnail_path: string | null;
  notes: string | null;
  created_at: string | null;
}

interface ResultRow {
  marker: string;
  value: number | null;
  unit: string | null;
  status: string | null;
  category: string | null;
}

const CATEGORY_ORDER = [
  "iron",
  "vitamins",
  "minerals",
  "inflammation",
  "thyroid",
  "hormones",
  "other",
] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return "Undated";
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
}

function referenceText(marker: string): string | null {
  const r = BLOOD_RANGES[marker];
  if (!r) return null;
  const unit = r.unit ? ` ${r.unit}` : "";
  if (r.low !== undefined && r.high !== undefined) {
    return `${r.low}–${r.high}${unit}`;
  }
  if (r.high !== undefined) return `below ${r.high}${unit}`;
  if (r.low !== undefined) return `above ${r.low}${unit}`;
  return null;
}

function shouldBeText(marker: string, status: BloodStatus): string | null {
  const r = BLOOD_RANGES[marker];
  if (!r) return null;
  const ref = referenceText(marker);
  if (!ref) return null;
  if (status === "low") return `Aim for ${ref}`;
  if (status === "high") return `Aim for ${ref}`;
  return `Reference range ${ref}`;
}

export default function BloodPanelReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["blood-panel", id, user?.id ?? "anon"],
    enabled: !!id && !!user,
    queryFn: async () => {
      const { data: panel } = await supabase
        .from("blood_panels" as never)
        .select(
          "id, user_id, panel_date, scheduled_at, status, label, test_type, lab_name, thumbnail_path, notes, created_at",
        )
        .eq("id", id!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!panel) return { panel: null, results: [] as ResultRow[] };
      const { data: results } = await supabase
        .from("blood_results")
        .select("marker, value, unit, status, category")
        .eq("user_id", user!.id)
        .eq("panel_id", id!);
      return {
        panel: panel as unknown as PanelRow,
        results: (results ?? []) as unknown as ResultRow[],
      };
    },
  });

  const panel = data?.panel ?? null;
  const thumbUrl = useBloodPanelThumb(panel?.thumbnail_path);
  const results = data?.results ?? [];

  // Group results by category. Anything we don't know goes into "other".
  const grouped = useMemo(() => {
    const g: Record<string, ResultRow[]> = {};
    for (const r of results) {
      const cat =
        (r.category as string | null) ??
        BLOOD_RANGES[r.marker]?.category ??
        "other";
      if (!g[cat]) g[cat] = [];
      g[cat].push(r);
    }
    // Sort each group: flagged first, then alphabetical.
    for (const k of Object.keys(g)) {
      g[k].sort((a, b) => {
        const aFlag = a.status === "low" || a.status === "high" ? 0 : 1;
        const bFlag = b.status === "low" || b.status === "high" ? 0 : 1;
        if (aFlag !== bFlag) return aFlag - bFlag;
        return a.marker.localeCompare(b.marker);
      });
    }
    return g;
  }, [results]);

  const flaggedCount = results.filter(
    (r) => r.status === "low" || r.status === "high",
  ).length;

  const deletePanel = useMutation({
    mutationFn: async () => {
      if (!id) return;
      const { error } = await supabase
        .from("blood_panels" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Blood test deleted");
      qc.invalidateQueries({ queryKey: ["blood-history"] });
      navigate("/blood-history", { replace: true });
    },
    onError: () => toast.error("Couldn't delete — try again"),
  });

  const toggle = (marker: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(marker)) n.delete(marker);
      else n.add(marker);
      return n;
    });
  };

  return (
    <ScreenLayout>
      <TitleBar title="Review results" onBack={() => navigate("/blood-history")} />

      <div className="px-5 pt-2 pb-10 space-y-4">
        {isLoading ? (
          <SurfaceCard>
            <p className="text-sm font-body text-muted-foreground">Loading…</p>
          </SurfaceCard>
        ) : !panel ? (
          <SurfaceCard>
            <p className="text-sm font-body">
              This blood test couldn't be found. It may have been deleted.
            </p>
            <Button
              variant="gold"
              size="pill"
              className="w-full mt-3"
              onClick={() => navigate("/blood-history")}
            >
              Back to blood work
            </Button>
          </SurfaceCard>
        ) : (
          <>
            {/* Header card — test identity */}
            <SurfaceCard>
              <div className="flex items-start gap-3">
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt=""
                    className="size-12 rounded-[14px] object-cover border border-border/60 shrink-0"
                  />
                ) : (
                  <div className="size-12 rounded-[14px] bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FlaskConical className="size-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h1 className="font-display text-lg leading-tight text-foreground">
                    {panel.label ?? "Blood test"}
                  </h1>
                  <div className="mt-2 space-y-1.5 text-xs font-body text-foreground/70">
                    {panel.test_type && (
                      <div className="flex items-center gap-2">
                        <BadgeCheck className="size-3.5 text-primary/70 shrink-0" />
                        <span>{panel.test_type}</span>
                      </div>
                    )}
                    {panel.lab_name && (
                      <div className="flex items-center gap-2">
                        <Building2 className="size-3.5 text-primary/70 shrink-0" />
                        <span>{panel.lab_name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <CalendarDays className="size-3.5 text-primary/70 shrink-0" />
                      <span>{fmtDate(panel.panel_date)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-xs font-body">
                <span className="text-foreground/70">
                  {results.length} marker{results.length === 1 ? "" : "s"}
                </span>
                <span
                  className={cn(
                    "px-2.5 py-1 rounded-full",
                    flaggedCount > 0
                      ? "bg-warn/15 text-warn"
                      : "bg-good/15 text-good",
                  )}
                >
                  {flaggedCount > 0
                    ? `${flaggedCount} outside range`
                    : "All within range"}
                </span>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <div className="flex items-start gap-2 text-xs font-body text-foreground/70">
                <Info className="size-4 shrink-0 text-primary/70 mt-0.5" />
                <p>
                  This is a read-only view of the values STRAND read from your
                  report. Values can't be edited — if something is wrong,
                  delete this panel and re-upload the source document.
                </p>
              </div>
            </SurfaceCard>

            {/* Categorised markers */}
            {CATEGORY_ORDER.map((cat) => {
              const rows = grouped[cat];
              if (!rows || rows.length === 0) return null;
              const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
              return (
                <section key={cat} className="space-y-2">
                  <SectionLabel>{meta.label}</SectionLabel>
                  <p className="text-xs font-body text-muted-foreground -mt-1">
                    {meta.blurb}
                  </p>
                  <SurfaceCard padded={false}>
                    <ul className="divide-y divide-border/60">
                      {rows.map((r) => {
                        const status = (r.status ?? "untested") as BloodStatus;
                        const isFlag =
                          status === "low" || status === "high";
                        const ref = referenceText(r.marker);
                        const target = shouldBeText(r.marker, status);
                        const info = MARKER_EXPLANATIONS[r.marker];
                        const isOpen = expanded.has(r.marker);
                        return (
                          <li key={r.marker}>
                            <button
                              onClick={() => toggle(r.marker)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-body font-semibold truncate">
                                  {r.marker}
                                </p>
                                <p className="text-xs text-muted-foreground font-body mt-0.5 truncate">
                                  {ref ? `Normal ${ref}` : "Reference not set"}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-body font-semibold text-foreground">
                                  {r.value ?? "–"}
                                  {r.unit ? (
                                    <span className="text-xs text-muted-foreground ml-1">
                                      {r.unit}
                                    </span>
                                  ) : null}
                                </p>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 mt-0.5 text-[10px] font-body px-2 py-0.5 rounded-full",
                                    status === "low" &&
                                      "bg-warn/15 text-warn",
                                    status === "high" &&
                                      "bg-warn/15 text-warn",
                                    status === "normal" &&
                                      "bg-good/15 text-good",
                                    status === "untested" &&
                                      "bg-muted text-foreground/60",
                                  )}
                                >
                                  {status === "low" && (
                                    <ArrowDown className="size-3" />
                                  )}
                                  {status === "high" && (
                                    <ArrowUp className="size-3" />
                                  )}
                                  {statusLabel(status)}
                                </span>
                              </div>
                              <span className="shrink-0 ml-1">
                                {isOpen ? (
                                  <ChevronUp className="size-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="size-4 text-muted-foreground" />
                                )}
                              </span>
                            </button>

                            {isOpen && (
                              <div className="px-4 pb-4 -mt-1 text-xs font-body text-foreground/80 space-y-2 bg-muted/30">
                                {info ? (
                                  <>
                                    <p>
                                      <span className="font-semibold text-foreground">
                                        What it is —{" "}
                                      </span>
                                      {info.what}
                                    </p>
                                    <p>
                                      <span className="font-semibold text-foreground">
                                        Why it matters —{" "}
                                      </span>
                                      {info.whyItMatters}
                                    </p>
                                    {isFlag && target && (
                                      <p className="text-warn">
                                        <span className="font-semibold">
                                          Your target —{" "}
                                        </span>
                                        {target}
                                      </p>
                                    )}
                                    {status === "low" && info.ifLow && (
                                      <p>
                                        <span className="font-semibold text-foreground">
                                          If low —{" "}
                                        </span>
                                        {info.ifLow}
                                      </p>
                                    )}
                                    {status === "high" && info.ifHigh && (
                                      <p>
                                        <span className="font-semibold text-foreground">
                                          If high —{" "}
                                        </span>
                                        {info.ifHigh}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-muted-foreground">
                                    STRAND doesn't have a plain-English
                                    explanation for this marker yet. Your
                                    value has been recorded from your report
                                    for reference.
                                  </p>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </SurfaceCard>
                </section>
              );
            })}

            {/* Delete-only action */}
            <div className="pt-2">
              <Button
                variant="outline"
                size="pill"
                onClick={() => setConfirmDelete(true)}
                disabled={deletePanel.isPending}
                className="w-full text-warn border-warn/40 hover:bg-warn/10"
              >
                <Trash2 className="size-4" />
                {deletePanel.isPending ? "Deleting…" : "Delete this test"}
              </Button>
              <p className="text-[11px] text-muted-foreground font-body text-center mt-2">
                Values can't be edited. To correct anything, delete this test
                and re-upload the original document.
              </p>
            </div>
          </>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this blood test?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the test and every marker on it from your history.
              This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePanel.mutate()}
              className="bg-warn text-warn-foreground hover:bg-warn/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
  );
}
