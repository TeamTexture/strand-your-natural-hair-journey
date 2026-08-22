// Blood Panel Review — read-only curated view of a single blood test.
//
// Rules (per product spec):
//  - Data is pulled directly from what was uploaded and cannot be edited here.
//  - Users can DELETE a panel but not change individual values.
//  - Markers are grouped by category and each row expands to a plain-English
//    explanation of what the marker is and why it matters for hair.
//  - Header clearly states test name, test type, lab/brand and date.
import { smartBack } from "@/lib/smartBack";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Info,
  Pencil,
  Trash2,
  Building2,
  BadgeCheck,
  X,
} from "lucide-react";

import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  FOOD_FIRST_NOTE,
  NUTRITION_BOOK_REF,
  foodsForDiet,
} from "@/data/bloodMarkerExplanations";
import { useDietType } from "@/hooks/useDietType";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import AiProse from "@/components/tips/AiProse";
import { shortForm, wantsDetail, wantsWhy, type GuidanceTip } from "@/lib/tipsRender";
import AnchorStat from "@/components/guidance/AnchorStat";
import ActionList from "@/components/guidance/ActionList";
import MarkerBadgeRow, { type MarkerSeverity } from "@/components/blood/MarkerBadgeRow";

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

/** Title-case a brand/lab name so entries like "medichecks" or "THRIVA" render
 *  consistently as "Medichecks" / "Thriva" in the header. Preserves short
 *  connectors and known acronyms. */
function titleCaseBrand(input: string | null): string | null {
  if (!input) return input;
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  const acronyms = new Set(["NHS", "GP", "UK", "US", "USA", "DNA", "MRI"]);
  const small = new Set(["and", "of", "the", "for", "de", "la"]);
  return trimmed
    .split(/(\s+|-)/)
    .map((tok, i) => {
      if (/^\s+$/.test(tok) || tok === "-") return tok;
      const upper = tok.toUpperCase();
      if (acronyms.has(upper)) return upper;
      const lower = tok.toLowerCase();
      if (i > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/** Plain-English one-liner describing what a blood test was for, based on its
 *  extracted test type / label. Helps people who've forgotten why they took
 *  a specific test remember its purpose at a glance. */
function describeTestPurpose(
  testType: string | null,
  label: string | null,
): string | null {
  const src = `${testType ?? ""} ${label ?? ""}`.toLowerCase();
  if (!src.trim()) return null;
  if (/thyroid|tsh|t3|t4/.test(src))
    return "Checks how well your thyroid is working — a common driver of shedding, dryness and slow growth.";
  if (/ferritin|iron|anaemia|anemia/.test(src))
    return "Measures iron stores and transport — low levels are one of the most common causes of hair shedding in women.";
  if (/hormone|oestrogen|estrogen|testosterone|dhea|prolactin|fsh|lh|cortisol/.test(src))
    return "Looks at reproductive and stress hormones that influence hair density, texture and shedding patterns.";
  if (/vitamin d/.test(src))
    return "Vitamin D status — supports the hair follicle cycle and overall scalp health.";
  if (/b12|folate|vitamin b/.test(src))
    return "B-vitamin status — important for red blood cell production and healthy hair growth.";
  if (/vitamin|nutrient|micronutrient/.test(src))
    return "Screens key vitamins and micronutrients that underpin hair growth and strength.";
  if (/mineral|zinc|magnesium|selenium|copper/.test(src))
    return "Measures minerals essential for keratin production and follicle function.";
  if (/inflammation|crp|esr|autoimmune|ana/.test(src))
    return "Inflammation markers — chronic inflammation can affect the scalp and hair cycle.";
  if (/glucose|hba1c|diabetes|insulin/.test(src))
    return "Blood sugar control — long-term imbalances can affect scalp circulation and hair health.";
  if (/cholesterol|lipid/.test(src))
    return "Cholesterol and lipid profile — reflects overall cardiovascular and metabolic health.";
  if (/liver/.test(src))
    return "Liver function markers — the liver processes nutrients and hormones that impact hair.";
  if (/kidney|renal/.test(src))
    return "Kidney function markers — reflect how well your body clears waste and balances minerals.";
  if (/full blood|complete blood|fbc|cbc/.test(src))
    return "A general overview of your blood cells — useful baseline for spotting anaemia or infection.";
  if (/wellness|general health|baseline|comprehensive/.test(src))
    return "A general wellness screen covering the key markers that influence overall and hair health.";
  return "A snapshot of the markers relevant to your overall health and hair.";
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
  const { level } = useTipsLevel();
  const diet = useDietType();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");

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
      // Best-effort remove the source-doc thumbnail before deleting the row.
      if (panel?.thumbnail_path) {
        await supabase.storage
          .from("blood-panel-thumbs")
          .remove([panel.thumbnail_path])
          .catch(() => {});
      }
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
  const renamePanel = useMutation({
    mutationFn: async (nextLabel: string) => {
      if (!id) return;
      const clean = nextLabel.trim().slice(0, 120) || null;
      const { error } = await supabase
        .from("blood_panels" as never)
        .update({ label: clean } as never)
        .eq("id", id);
      if (error) throw error;
      return clean;
    },
    onSuccess: () => {
      toast.success("Name updated");
      qc.invalidateQueries({ queryKey: ["blood-panel", id] });
      qc.invalidateQueries({ queryKey: ["blood-history"] });
      setEditingLabel(false);
    },
    onError: () => toast.error("Couldn't rename — try again"),
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
      <TitleBar title="Review results" onBack={smartBack(navigate, "/blood-history")} />

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
                  {editingLabel ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        autoFocus
                        value={labelDraft}
                        onChange={(e) => setLabelDraft(e.target.value)}
                        placeholder="e.g. Advanced Thyroid Blood Test"
                        className="font-display text-base h-9"
                        maxLength={120}
                      />
                      <button
                        type="button"
                        onClick={() => renamePanel.mutate(labelDraft)}
                        disabled={renamePanel.isPending}
                        className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-60"
                        aria-label="Save name"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingLabel(false)}
                        className="size-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0"
                        aria-label="Cancel"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1.5">
                      <h1 className="font-display text-lg leading-tight text-foreground flex-1 min-w-0 break-words">
                        {panel.label ?? "Blood test"}
                      </h1>
                      <button
                        type="button"
                        onClick={() => {
                          setLabelDraft(panel.label ?? "");
                          setEditingLabel(true);
                        }}
                        className="size-7 rounded-full text-foreground/60 hover:text-foreground hover:bg-muted flex items-center justify-center shrink-0"
                        aria-label="Rename blood test"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                  )}
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
                        <span>{titleCaseBrand(panel.lab_name)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <CalendarDays className="size-3.5 text-primary/70 shrink-0" />
                      <span>{fmtDate(panel.panel_date)}</span>
                    </div>
                  </div>
                  {(() => {
                    const purpose = describeTestPurpose(panel.test_type, panel.label);
                    return purpose ? <AiProse text={purpose} className="mt-2.5" /> : null;
                  })()}

                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-border/60">
                <AnchorStat
                  value={flaggedCount}
                  context={
                    flaggedCount === 1
                      ? `marker outside range out of ${results.length}`
                      : `markers outside range out of ${results.length}`
                  }
                  tone={flaggedCount > 0 ? "warning" : "good"}
                />
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

            {/* Priority actions — one at level 1, more as the level rises */}
            {(() => {
              const flaggedRows = results.filter((r) => r.status === "low" || r.status === "high");
              if (flaggedRows.length === 0) return null;
              const tips: GuidanceTip[] = flaggedRows.map((r, i) => {
                const info = MARKER_EXPLANATIONS[r.marker];
                const status = (r.status ?? "untested") as BloodStatus;
                const foods = status === "low" ? foodsForDiet(info, diet).slice(0, 3) : [];
                const short = foods.length
                  ? `${r.marker}: build in food sources — ${foods.join(", ")}.`
                  : `Take your ${r.marker.toLowerCase()} result to your GP for interpretation.`;
                return {
                  priority: flaggedRows.length - i,
                  short,
                  why: info?.whyItMatters,
                };
              });

              return (
                <section className="space-y-2">
                  <SectionLabel>Priority actions</SectionLabel>
                  <SurfaceCard>
                    <ActionList
                      idPrefix="panel-priority"
                      actions={tips.map((t) => ({ action: t.short, why: t.why }))}
                      showWhy
                    />
                  </SurfaceCard>
                </section>
              );
            })()}

            {/* Categorised markers */}
            {CATEGORY_ORDER.map((cat) => {
              const rows = grouped[cat];
              if (!rows || rows.length === 0) return null;
              const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
              return (
                <section key={cat} className="space-y-2">
                  <SectionLabel>{meta.label}</SectionLabel>
                  <AiProse text={meta.blurb} className="-mt-1 text-muted-foreground" />
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
                        const severity: MarkerSeverity =
                          status === "low" ? "deficient" : status === "high" ? "high" : "optimal";
                        const rowImpact =
                          level === 1 && isFlag && info
                            ? shortForm(info.whyItMatters, 1)
                            : ref
                              ? `Normal ${ref}`
                              : "Reference not set";
                        return (
                          <li key={r.marker}>
                            <button
                              onClick={() => toggle(r.marker)}
                              aria-expanded={isOpen}
                              className="w-full flex items-center gap-2 px-4 py-1.5 text-left"
                            >
                              {status === "untested" ? (
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-body font-semibold truncate">{r.marker}</p>
                                  <p className="text-xs text-muted-foreground font-body mt-0.5 truncate">
                                    {rowImpact}
                                  </p>
                                </div>
                              ) : (
                                <MarkerBadgeRow
                                  className="flex-1 min-w-0 py-1.5"
                                  marker={r.marker}
                                  severity={severity}
                                  statusLabel={statusLabel(status)}
                                  value={r.value != null ? `${r.value}${r.unit ? ` ${r.unit}` : ""}` : undefined}
                                  impact={rowImpact}
                                />
                              )}
                              <span className="shrink-0 ml-1">
                                {isOpen ? (
                                  <ChevronUp className="size-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="size-4 text-muted-foreground" />
                                )}
                              </span>
                            </button>

                            {isOpen && (
                              <div className="px-4 pt-4 pb-5 text-xs font-body text-foreground/80 space-y-3 bg-secondary/40 border-t border-border/40">
                                {info ? (
                                  <>
                                    {/* Nutrition/diet education is exempt from the tips-level
                                        density scale — a marker's meaning and what it means for
                                        hair care always render in full at every level. */}
                                    <div className="space-y-1.5">
                                      <p className="text-[11px] uppercase tracking-wide font-semibold text-primary/80">
                                        What it is
                                      </p>
                                      <AiProse text={info.what} />
                                    </div>
                                    <div className="space-y-1.5">
                                      <p className="text-[11px] uppercase tracking-wide font-semibold text-primary/80">
                                        Why it matters
                                      </p>
                                      <AiProse text={info.whyItMatters} />
                                    </div>

                                    {isFlag && target && (
                                      <div className="space-y-1.5 rounded-xl bg-warn/10 px-3 py-2.5">
                                        <p className="text-[11px] uppercase tracking-wide font-semibold text-warn">
                                          Your target
                                        </p>
                                        <p className="leading-relaxed text-warn">
                                          {target}
                                        </p>
                                      </div>
                                    )}
                                    {status === "low" && info.ifLow && (
                                      <div className="space-y-1.5">
                                        <p className="text-[11px] uppercase tracking-wide font-semibold text-foreground">
                                          What a low reading can mean
                                        </p>
                                        <AiProse text={info.ifLow} />
                                      </div>
                                    )}
                                    {status === "high" && info.ifHigh && (
                                      <div className="space-y-1.5">
                                        <p className="text-[11px] uppercase tracking-wide font-semibold text-foreground">
                                          What a high reading can mean
                                        </p>
                                        <AiProse text={info.ifHigh} />
                                      </div>
                                    )}
                                    {(() => {
                                      const foods = foodsForDiet(info, diet);
                                      if (foods.length === 0) return null;
                                      return (
                                        <div className="space-y-2 rounded-xl bg-background/70 px-3 py-3 border border-border/50">
                                          <p className="text-[11px] uppercase tracking-wide font-semibold text-primary/80">
                                            Where to find it in food
                                            {diet === "vegan"
                                              ? " — plant-based"
                                              : diet === "vegetarian"
                                                ? " — vegetarian"
                                                : diet === "pescatarian"
                                                  ? " — pescatarian"
                                                  : diet === "other" || diet === "unknown"
                                                    ? " — plant-based"
                                                    : ""}
                                          </p>
                                          <ul className="space-y-1">
                                            {foods.map((f) => (
                                              <li key={f} className="flex gap-2 leading-relaxed">
                                                <span className="mt-[6px] size-1 rounded-full bg-primary/60 shrink-0" aria-hidden />
                                                <span>{f}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      );
                                    })()}
                                    <div className="space-y-1.5 pt-1 border-t border-border/40">
                                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                                        {FOOD_FIRST_NOTE}
                                      </p>
                                      <p className="text-[11px] italic text-muted-foreground/90">
                                        {NUTRITION_BOOK_REF}
                                      </p>
                                    </div>
                                  </>

                                ) : (
                                  <p className="text-muted-foreground leading-relaxed">
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
