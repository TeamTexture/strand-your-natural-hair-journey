import { smartBack } from "@/lib/smartBack";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, X, Flame, Loader2, Plus } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import StepProgress from "@/components/nav/StepProgress";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import Tag from "@/components/Tag";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { buildAiContext } from "@/lib/aiContext";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import { toast } from "sonner";
import WashDaySteps from "@/components/WashDaySteps";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import ProductPickerSheet from "@/components/ProductPickerSheet";
import HeatToolPicker from "@/components/HeatToolPicker";
import HeatStepEditor, { type HeatChoice, type HeatRationale } from "@/components/wash/HeatStepEditor";
import { washStepLabel, rollUpStepHeat, type StepHeat } from "@/lib/washSteps";
import { useUserTools } from "@/hooks/useUserTools";
import AiProse from "@/components/tips/AiProse";
import LevelGate from "@/components/tips/LevelGate";
import StatusCallout from "@/components/guidance/StatusCallout";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import ActionList from "@/components/guidance/ActionList";
import KeyFactChips from "@/components/guidance/KeyFactChips";
import { emphasisSplit } from "@/lib/tipsRender";

/** Format a user product as a single chip label, e.g. "Honey & Turmeric Deep Cond — TGIN". */
const formatProduct = (p: UserProduct): string =>
  p.brand ? `${p.name} — ${p.brand}` : p.name;

type StepKind = "prepoo" | "cleanse" | "condition" | "treatment";

/**
 * Pick product IDs from the user's shelf that look like they belong to a wash-day step.
 * Used only as a starter suggestion — the user can add or remove inline.
 */
const suggestStepProductIds = (
  shelf: UserProduct[],
  kind: StepKind,
  lastWashIds: string[],
): string[] => {
  // Only pre-populate a step with products the user actually used on their
  // last wash day. First-ever wash days (or steps with no matching product
  // from the last log) start empty — the user has to add products manually.
  if (!lastWashIds.length) return [];
  const lastSet = new Set(lastWashIds);
  return shelf
    .filter((p) => {
      if (!lastSet.has(p.id)) return false;
      const cat = (p.category ?? "").toLowerCase();
      const name = (p.name ?? "").toLowerCase();
      if (kind === "cleanse") return /shampoo|cleans|co-?wash/.test(cat) || /shampoo|cleans|co-?wash/.test(name);
      if (kind === "condition") return /condition/.test(cat) || /condition/.test(name);
      if (kind === "prepoo") return /pre-?poo|oil/.test(cat) || /pre-?poo|hot oil/.test(name);
      if (kind === "treatment") return /treatment|mask|protein|bond/.test(cat) || /treatment|mask|protein|bond/.test(name);
      return false;
    })
    .map((p) => p.id);
};



interface Step {
  id: string;
  emoji: string;
  name: string;
  sub: string;
}

/**
 * Each step has four states so people can be honest about what they actually did:
 *   - "todo"    — not yet logged (default)
 *   - "editing" — user opened the step to log products / options (the inline editor is open)
 *   - "done"    — finished logging; editor collapses and shows a summary of what was captured
 *   - "skipped" — explicitly didn't do it today (logged for accuracy, no products saved)
 */
type StepState = "todo" | "editing" | "done" | "skipped";

const StepCard = ({
  step,
  state,
  setState,
  /** Resolved products the user has selected for this step (from their shelf). */
  selectedProducts,
  /** Remove a product from this step's selection. */
  onRemoveProduct,
  /** Open the inline picker sheet (lets the user pick existing or add new). */
  onOpenPicker,
  /** What to render inside the inline editor (only visible while state === "editing"). */
  editor,
  /**
   * Optional collapsed summary chips shown under the header once the step is "done".
   * If omitted we just show the products captured for this step.
   */
  summaryChips,
  /** Show a "from your last wash day" hint above the picked list. */
  showLastWashHint = false,
}: {
  step: Step;
  state: StepState;
  setState: (s: StepState) => void;
  selectedProducts: UserProduct[];
  onRemoveProduct: (id: string) => void;
  onOpenPicker: () => void;
  editor?: React.ReactNode;
  summaryChips?: string[];
  showLastWashHint?: boolean;
}) => {

  const isEditing = state === "editing";
  const isDone = state === "done";
  const isSkipped = state === "skipped";
  const productLabels = selectedProducts.map(formatProduct);
  const chips = summaryChips ?? productLabels;
  return (
    <SurfaceCard className={cn(isSkipped && "opacity-70")}>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "size-10 rounded-[10px] flex items-center justify-center text-xl",
            isSkipped ? "bg-muted" : isDone ? "bg-primary/25" : "bg-primary/15",
          )}
        >
          {isSkipped ? <X className="size-5 text-muted-foreground" /> : step.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "font-display text-base font-semibold leading-tight",
              isSkipped && "line-through text-muted-foreground",
            )}
          >
            {step.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {isSkipped ? "Skipped today" : isDone ? "Logged ✓" : step.sub}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              if (isEditing) setState("todo");
              else if (isDone) setState("editing");
              else setState("editing");
            }}
            aria-pressed={isEditing || isDone}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors min-h-[32px]",
              isDone
                ? "bg-primary text-primary-foreground border-primary"
                : isEditing
                  ? "bg-muted text-foreground border-border"
                  : "bg-card text-muted-foreground border-border",
            )}
          >
            {isDone ? "Edit" : isEditing ? "Cancel" : "Add"}
          </button>
          <button
            onClick={() => setState(isSkipped ? "todo" : "skipped")}
            aria-pressed={isSkipped}
            aria-label={isSkipped ? "Undo skip" : "Skip this step"}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors min-h-[32px]",
              isSkipped
                ? "bg-muted text-foreground border-border"
                : "bg-card text-muted-foreground border-border hover:bg-muted",
            )}
          >
            {isSkipped ? "Undo" : "Skip"}
          </button>
        </div>
      </div>

      {/* DONE: collapsed summary so users can see at a glance what they logged */}
      {isDone && chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-[11px]"
            >
              <Check className="size-3 text-good shrink-0" />
              <span className="truncate max-w-[180px]">{c}</span>
            </span>
          ))}
        </div>
      )}
      {isDone && chips.length === 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground italic">
          Logged with no extras.
        </p>
      )}

      {/* EDITING: inline editor — shows currently picked products with remove
          buttons, plus a real "Add a product" CTA that opens the picker
          (which itself supports photo / upload / link with auto-save to shelf). */}
      {isEditing && (
        <div className="mt-3 space-y-2">
          {showLastWashHint && selectedProducts.length > 0 && (
            <div className="px-3 py-2 rounded-[10px] bg-primary/5 border border-primary/20 text-[11px] text-foreground/80 leading-snug">
              Pre-filled from your last wash day. Used these again? Remove any you didn't, or add a new one below.
            </div>
          )}

          {selectedProducts.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/30 rounded-[10px]"
            >
              <Check className="size-4 text-good shrink-0" />
              <span className="text-xs flex-1 truncate">{formatProduct(p)}</span>
              <button
                type="button"
                onClick={() => onRemoveProduct(p.id)}
                aria-label={`Remove ${p.name}`}
                className="size-6 rounded-full hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onOpenPicker}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 border border-dashed border-primary/50 rounded-[10px] text-xs font-medium text-primary hover:bg-primary/5 transition-colors min-h-[40px]"
          >
            <Plus className="size-4" />
            Add a product
          </button>
          {editor}
          <Button
            variant="gold"
            size="pill"
            className="w-full mt-1"
            onClick={() => setState("done")}
          >
            Done
          </Button>
        </div>
      )}
    </SurfaceCard>
  );
};

// Heat-treatment selection, captured independently per step (Condition and
// Treatment / Mask):
//   - "yes": user used a TT Heat Hat on that step
//   - "no":  user explicitly didn't — triggers a personalised AI explainer
//   - null:  not yet answered
// `HeatChoice` / `HeatRationale` now live with the shared HeatStepEditor.

/** Summary chips for one step's heat answer, shown on the collapsed card. */
const heatChips = (
  choice: HeatChoice,
  minutes: number | null,
  toolIds: string[],
  tools: Array<{ id: string; name: string; brand?: string | null }>,
): string[] => {
  if (choice === "no") return ["No heat"];
  if (choice !== "yes") return [];
  return [
    minutes ? `Heat · ${minutes} min` : "Heat treatment",
    ...toolIds
      .map((id) => tools.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => (t.brand ? `${t.name} — ${t.brand}` : t.name)),
  ];
};



const WashStep1 = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Default every step to "todo" so the user has to actively log what they did.
  // The previous defaults (all "done") implied actions had been completed before
  // the user ever opened the screen, which doubled as hardcoded data.
  const { level, showBeginnerHelp } = useTipsLevel();
  const [heatWhyOpen, setHeatWhyOpen] = useState(false);
  const [prePoo, setPrePoo] = useState<StepState>("todo");
  const [cleanse, setCleanse] = useState<StepState>("todo");
  const [coWash, setCoWash] = useState<StepState>("todo");
  const [condition, setCondition] = useState<StepState>("todo");
  const [treatment, setTreatment] = useState<StepState>("todo");

  const [treatmentType, setTreatmentType] = useState<string[]>([]);

  // Pull the user's full shelf so we can both auto-suggest products per step
  // and resolve any IDs the user has manually picked or just added via the
  // inline picker (auto_save lands them straight on the shelf and we return
  // here with the new product available).
  const { products: shelfProducts, loading: shelfLoading } = useUserProducts("shelf");

  // Per-step selections — arrays of user_product IDs. We seed them from the
  // shelf the first time it loads and on each step from a category match,
  // then preserve any draft the user is mid-way through (so adding a brand
  // new product doesn't wipe the others they already picked).
  const [prePooIds, setPrePooIds] = useState<string[]>([]);
  const [cleanseIds, setCleanseIds] = useState<string[]>([]);
  const [coWashIds, setCoWashIds] = useState<string[]>([]);
  const [conditionIds, setConditionIds] = useState<string[]>([]);
  const [treatmentIds, setTreatmentIds] = useState<string[]>([]);

  // Heat-treatment state lives at the page level so we can persist it and so
  // the "why" dialog can read/write the choice. Condition and Treatment / Mask
  // each carry their own answer — using heat under a mask is a different
  // decision from using it under a conditioner.
  const [heatChoice, setHeatChoice] = useState<HeatChoice>(null);
  const [heatDialogOpen, setHeatDialogOpen] = useState(false);
  const [heatRationale, setHeatRationale] = useState<HeatRationale | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);
  // How long the user kept heat on for. Captured only when heatChoice === "yes".
  const [heatMinutes, setHeatMinutes] = useState<number | null>(null);
  // TT Heat Hat tools attached to today's conditioning step.
  const [heatToolIds, setHeatToolIds] = useState<string[]>([]);
  // Independent heat answer for the Treatment / Mask step.
  const [treatmentHeatChoice, setTreatmentHeatChoice] = useState<HeatChoice>(null);
  const [treatmentHeatMinutes, setTreatmentHeatMinutes] = useState<number | null>(null);
  const [treatmentHeatToolIds, setTreatmentHeatToolIds] = useState<string[]>([]);
  const { tools: allTools } = useUserTools();
  const toolNames = (ids: string[]) =>
    ids
      .map((id) => allTools.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => (t.brand ? `${t.name} — ${t.brand}` : t.name));


  // Products used on the user's most recent wash day. We only pre-populate
  // steps from this list — never a broader category match — so today's log
  // starts with exactly what the user reached for last time.
  const [lastWashProductIds, setLastWashProductIds] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("wash_days")
        .select("product_ids")
        .order("wash_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const ids = Array.isArray(data?.product_ids) ? (data!.product_ids as string[]) : [];
      setLastWashProductIds(ids);
    })();
    return () => { cancelled = true; };
  }, []);

  // Restore any in-progress draft (e.g. user came back from the scan flow
  // after adding a new product). Run once shelfProducts is available so we
  // can also auto-merge any newly-shelved products into the right step.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated) return;
    // Wait for the shelf AND the last-wash lookup before seeding — otherwise
    // we lock in empty arrays and lose the pre-fill.
    if (shelfLoading) return;
    if (lastWashProductIds === null) return;
    let draft: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem("strand_wash_step1_draft");
      if (raw) draft = JSON.parse(raw) as Record<string, unknown>;
    } catch { /* ignore */ }
    const arr = (k: string) => (Array.isArray(draft[k]) ? (draft[k] as string[]) : []);
    const lastIds = lastWashProductIds;
    setPrePooIds(arr("prePooIds").length ? arr("prePooIds") : suggestStepProductIds(shelfProducts, "prepoo", lastIds));
    setCleanseIds(arr("cleanseIds").length ? arr("cleanseIds") : suggestStepProductIds(shelfProducts, "cleanse", lastIds));
    setCoWashIds(arr("coWashIds"));
    setConditionIds(arr("conditionIds").length ? arr("conditionIds") : suggestStepProductIds(shelfProducts, "condition", lastIds));
    setTreatmentIds(arr("treatmentIds").length ? arr("treatmentIds") : suggestStepProductIds(shelfProducts, "treatment", lastIds));
    if (typeof draft.prePoo === "string") setPrePoo(draft.prePoo as StepState);
    if (typeof draft.cleanse === "string") setCleanse(draft.cleanse as StepState);
    if (typeof draft.coWash === "string") setCoWash(draft.coWash as StepState);
    if (typeof draft.condition === "string") setCondition(draft.condition as StepState);
    if (typeof draft.treatment === "string") setTreatment(draft.treatment as StepState);
    if (Array.isArray(draft.treatmentType)) setTreatmentType(draft.treatmentType as string[]);
    if (typeof draft.heatChoice === "string") setHeatChoice(draft.heatChoice as HeatChoice);
    if (typeof draft.heatMinutes === "number") setHeatMinutes(draft.heatMinutes);
    if (Array.isArray(draft.heatToolIds)) setHeatToolIds(draft.heatToolIds as string[]);
    if (typeof draft.treatmentHeatChoice === "string")
      setTreatmentHeatChoice(draft.treatmentHeatChoice as HeatChoice);
    if (typeof draft.treatmentHeatMinutes === "number")
      setTreatmentHeatMinutes(draft.treatmentHeatMinutes);
    if (Array.isArray(draft.treatmentHeatToolIds))
      setTreatmentHeatToolIds(draft.treatmentHeatToolIds as string[]);
    setHydrated(true);
  }, [shelfProducts, shelfLoading, hydrated, lastWashProductIds]);


  // If user tapped a specific calendar date on the hub, persist it so WashStep4
  // saves the wash_day with that date rather than today.
  useEffect(() => {
    const d = searchParams.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      localStorage.setItem("strand_wash_date", d);
    } else {
      // No explicit date param → user is logging "today". Clear any stale
      // date left over from a previous calendar-tap so we don't back-date it.
      localStorage.removeItem("strand_wash_date");
    }
  }, [searchParams]);

  // Persist the draft on every change so a trip through the scan flow
  // (which navigates away and back) doesn't lose the user's progress.
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      "strand_wash_step1_draft",
      JSON.stringify({
        prePooIds, cleanseIds, coWashIds, conditionIds, treatmentIds,
        prePoo, cleanse, coWash, condition, treatment,
        treatmentType,
        heatChoice, heatMinutes, heatToolIds,
        treatmentHeatChoice, treatmentHeatMinutes, treatmentHeatToolIds,
      }),
    );
  }, [hydrated, prePooIds, cleanseIds, coWashIds, conditionIds, treatmentIds,
      prePoo, cleanse, coWash, condition, treatment, treatmentType,
      heatChoice, heatMinutes, heatToolIds,
      treatmentHeatChoice, treatmentHeatMinutes, treatmentHeatToolIds]);

  // Resolve IDs → full product objects for display.
  const resolve = (ids: string[]) =>
    ids.map((id) => shelfProducts.find((p) => p.id === id)).filter((p): p is UserProduct => !!p);
  const prePooSelected = useMemo(() => resolve(prePooIds), [prePooIds, shelfProducts]);
  const cleanseSelected = useMemo(() => resolve(cleanseIds), [cleanseIds, shelfProducts]);
  const coWashSelected = useMemo(() => resolve(coWashIds), [coWashIds, shelfProducts]);
  const conditionSelected = useMemo(() => resolve(conditionIds), [conditionIds, shelfProducts]);
  const treatmentSelected = useMemo(() => resolve(treatmentIds), [treatmentIds, shelfProducts]);

  // Picker sheet — one global sheet, opened with a target step so toggling
  // selects/deselects from that step's IDs. We also pass the target through
  // the picker's returnTo URL so any product added via auto_save lands back
  // on this step automatically (see hydration effect above).
  type PickerTarget = "prepoo" | "cleanse" | "cowash" | "condition" | "treatment" | null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const openPicker = (target: Exclude<PickerTarget, null>) => {
    setPickerTarget(target);
    // Encode the target in the URL so when the picker fires off the scan
    // flow (which navigates away and uses the current URL as returnTo),
    // we know which step the freshly-shelved product belongs to.
    const next = new URLSearchParams(searchParams);
    next.set("picker", target);
    setSearchParams(next, { replace: true });
    setPickerOpen(true);
  };
  const targetIds: Record<Exclude<PickerTarget, null>, string[]> = {
    prepoo: prePooIds,
    cleanse: cleanseIds,
    cowash: coWashIds,
    condition: conditionIds,
    treatment: treatmentIds,
  };
  const targetSetters: Record<Exclude<PickerTarget, null>, (v: string[]) => void> = {
    prepoo: setPrePooIds,
    cleanse: setCleanseIds,
    cowash: setCoWashIds,
    condition: setConditionIds,
    treatment: setTreatmentIds,
  };
  const handleTogglePicked = (productId: string) => {
    if (!pickerTarget) return;
    markTouched(pickerTarget);
    const current = targetIds[pickerTarget];
    targetSetters[pickerTarget](
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId],
    );
  };


  // When the user adds a brand new product via the picker (auto_save) they
  // get bounced through the scan/detail flow and back to this URL. We watch
  // for the most-recently-added shelf product and auto-merge it into the
  // step we encoded in `?picker=...`, so the new product shows up in the
  // right step without the user having to re-pick it. We track which IDs
  // we've already auto-added to avoid double-adding on subsequent renders.
  const [autoAdded, setAutoAdded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!hydrated) return;
    const target = searchParams.get("picker") as Exclude<PickerTarget, null> | null;
    if (!target) return;
    const cutoff = Date.now() - 2 * 60 * 1000;
    const fresh = shelfProducts.filter((p) => {
      if (autoAdded.has(p.id)) return false;
      const ts = p.added_to_shelf_at ?? p.created_at;
      return ts ? new Date(ts).getTime() > cutoff : false;
    });
    if (!fresh.length) return;
    const current = targetIds[target];
    const additions = fresh.map((p) => p.id).filter((id) => !current.includes(id));
    if (additions.length) {
      targetSetters[target]([...current, ...additions]);
      setAutoAdded((prev) => {
        const next = new Set(prev);
        for (const id of additions) next.add(id);
        return next;
      });
      setPickerTarget(target);
      setPickerOpen(true);
    }
  }, [shelfProducts, hydrated, searchParams, autoAdded, targetIds, targetSetters]);

  // (heat-treatment state hoisted above the persist effect, see top of component)

  // Fetch a personalised "why heat could help YOU" explanation grounded in the
  // user's hair profile, goals, challenges and recent wash history. Cached for
  // the lifetime of the component and shared by both heat steps, so the
  // rationale is only ever fetched once per visit.
  const fetchHeatRationale = async () => {
    if (heatRationale || heatLoading) return;
    setHeatLoading(true);
    try {
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke("heat-treatment-rationale", {
        body: { context },
      });
      if (error) throw error;
      setHeatRationale({
        headline: data?.headline ?? "Heat could help your conditioner work harder",
        reasons: Array.isArray(data?.reasons) ? data.reasons : [],
      });
    } catch (e) {
      console.warn("heat rationale failed", e);
      setHeatRationale({
        headline: "Heat could help your conditioner work harder",
        reasons: [
          "Gentle heat lifts the cuticle so deep conditioner absorbs further.",
          "Especially useful for length retention, dryness, or coarser strands.",
        ],
      });
    } finally {
      setHeatLoading(false);
    }
  };

  /** "No" on any heat step: record it, then explain what they're passing up. */
  const handleHeatNo = (setChoice: (c: HeatChoice) => void) => {
    setChoice("no");
    setHeatDialogOpen(true);
    void fetchHeatRationale();
  };


  // Track which step editors the user has actively touched, so the
  // "pre-filled from your last wash day" hint disappears once they act on it.
  type StepKey = "prepoo" | "cleanse" | "cowash" | "condition" | "treatment";
  const [touchedSteps, setTouchedSteps] = useState<Set<StepKey>>(new Set());
  const markTouched = (k: StepKey) =>
    setTouchedSteps((prev) => (prev.has(k) ? prev : new Set(prev).add(k)));
  const hintFor = (k: StepKey, selectedCount: number): boolean =>
    !!(lastWashProductIds && lastWashProductIds.length > 0)
    && !touchedSteps.has(k)
    && selectedCount > 0;

  const removeFrom = (setter: (v: string[]) => void, ids: string[], key: StepKey) => (id: string) => {
    markTouched(key);
    setter(ids.filter((x) => x !== id));
  };


  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" onBack={smartBack(navigate, "/wash-day")} tips />
      <div className="px-5 pt-1 pb-3"><StepProgress current={1} total={5} label="Steps & products" /></div>
      <ItalicSub>
        Tap <strong>Add</strong> for steps you did and <strong>Skip</strong> for steps you didn't — be honest, it makes your history more useful.
      </ItalicSub>

      <WashDaySteps className="px-5 mb-3" />

      <div className="px-5 space-y-3 pb-8">

        <StepCard
          step={{ id: "1", emoji: "🌿", name: "Pre-Poo", sub: "Pre-wash treatment" }}
          state={prePoo}
          setState={setPrePoo}
          selectedProducts={prePooSelected}
          onRemoveProduct={removeFrom(setPrePooIds, prePooIds, "prepoo")}
          showLastWashHint={hintFor("prepoo", prePooSelected.length)}
          onOpenPicker={() => openPicker("prepoo")}
        />
        <StepCard
          step={{ id: "2", emoji: "💧", name: "Cleanse", sub: "Shampoo — clarifying or gentle" }}
          state={cleanse}
          setState={setCleanse}
          selectedProducts={cleanseSelected}
          onRemoveProduct={removeFrom(setCleanseIds, cleanseIds, "cleanse")}
          showLastWashHint={hintFor("cleanse", cleanseSelected.length)}
          onOpenPicker={() => openPicker("cleanse")}
        />
        <StepCard
          step={{ id: "2b", emoji: "🧴", name: "Co-wash", sub: "Conditioning wash (between shampoos)" }}
          state={coWash}
          setState={setCoWash}
          selectedProducts={coWashSelected}
          onRemoveProduct={removeFrom(setCoWashIds, coWashIds, "cowash")}
          showLastWashHint={hintFor("cowash", coWashSelected.length)}
          onOpenPicker={() => openPicker("cowash")}
        />
        {/* Science-grounded caution: cationic surfactants in co-washes (e.g.
            behentrimonium methosulfate / cetrimonium chloride) condition and
            lift light debris, but they're not anionic surfactants. They can't
            emulsify oily build-up (sebum, butters, silicones, sunscreen, hard-
            water minerals) the way sulphates / mild anionic cleansers do.
            Co-washing alone week after week leads to product accumulation,
            scalp inflammation and dullness — surface the warning the moment
            the user logs a co-wash without a true cleanse, as advised in
            "How To Love Your Afro". */}
        {coWash === "done" && cleanse !== "done" && (
          <SurfaceCard className="border-destructive/40 bg-destructive/5">
            <div className="flex gap-2.5">
              <div className="size-8 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0 text-sm font-bold">!</div>
              <div className="flex-1">
                <p className="text-[12px] font-semibold mb-1">Co-wash isn't a deep cleanse</p>
                <LevelGate min={2} fallback={
                  <p className="text-[11.5px] leading-snug text-muted-foreground">
                    Pair co-washes with a proper cleanse at least every 2–3 weeks so build-up doesn't sit on the scalp.
                  </p>
                }>
                  <AiProse
                    className="text-muted-foreground"
                    text="Co-washes use cationic conditioning surfactants — they smooth and lift light dirt, but they can't emulsify oily build-up (sebum, butters, silicones, mineral residue). Only anionic surfactants in a true shampoo can lift that residue from the scalp and strands. Pair co-washes with a proper cleanse at least every 2–3 weeks to prevent build-up, flakes and scalp inflammation."
                  />
                </LevelGate>
              </div>
            </div>
          </SurfaceCard>
        )}
        <StepCard
          step={{ id: "3", emoji: "🫧", name: "Condition", sub: "Rinse-out or deep conditioner" }}
          state={condition}
          setState={setCondition}
          selectedProducts={conditionSelected}
          onRemoveProduct={removeFrom(setConditionIds, conditionIds, "condition")}
          showLastWashHint={hintFor("condition", conditionSelected.length)}
          onOpenPicker={() => openPicker("condition")}
          // Once Done, surface the conditioner(s) the user picked + the heat-treatment answer
          // as chips so they can see at a glance what they captured for this step.
          summaryChips={[
            ...conditionSelected.map(formatProduct),
            ...heatChips(heatChoice, heatMinutes, heatToolIds, allTools),
          ]}
          editor={
            <HeatStepEditor
              stepLabel={washStepLabel("Condition")}
              choice={heatChoice}
              onYes={() => setHeatChoice("yes")}
              onNo={() => handleHeatNo(setHeatChoice)}
              minutes={heatMinutes}
              onMinutes={setHeatMinutes}
              toolIds={heatToolIds}
              onToggleTool={(id) =>
                setHeatToolIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                )
              }
              rationale={heatRationale}
              rationaleLoading={heatLoading}
              onRequestRationale={() => void fetchHeatRationale()}
              onOpenWhyDialog={() => setHeatDialogOpen(true)}
              whyDialogOpen={heatDialogOpen}
              level={level}
            />
          }
        />
        <StepCard
          step={{ id: "4", emoji: "🧬", name: washStepLabel("Treatment"), sub: "Optional — only when needed" }}
          state={treatment}
          setState={setTreatment}
          selectedProducts={treatmentSelected}
          onRemoveProduct={removeFrom(setTreatmentIds, treatmentIds, "treatment")}
          showLastWashHint={hintFor("treatment", treatmentSelected.length)}
          onOpenPicker={() => openPicker("treatment")}
          // Show the treatment type tags the user picked, plus the products they selected
          // and the treatment-step heat answer — independent of the conditioner's.
          summaryChips={[
            ...treatmentType,
            ...treatmentSelected.map(formatProduct),
            ...heatChips(treatmentHeatChoice, treatmentHeatMinutes, treatmentHeatToolIds, allTools),
          ]}
          editor={
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-2">
                {["Bond repair", "Protein", "Scalp treatment", "Colour treatment", "Other"].map((t) => (
                  <Tag
                    key={t}
                    selected={treatmentType.includes(t)}
                    onClick={() =>
                      setTreatmentType(treatmentType.includes(t) ? treatmentType.filter((x) => x !== t) : [...treatmentType, t])
                    }
                  >
                    {t}
                  </Tag>
                ))}
              </div>
              {/* Same heat flow as the Condition step, fully independent answer. */}
              <HeatStepEditor
                stepLabel={washStepLabel("Treatment")}
                choice={treatmentHeatChoice}
                onYes={() => setTreatmentHeatChoice("yes")}
                onNo={() => handleHeatNo(setTreatmentHeatChoice)}
                minutes={treatmentHeatMinutes}
                onMinutes={setTreatmentHeatMinutes}
                toolIds={treatmentHeatToolIds}
                onToggleTool={(id) =>
                  setTreatmentHeatToolIds((prev) =>
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                  )
                }
                rationale={heatRationale}
                rationaleLoading={heatLoading}
                onRequestRationale={() => void fetchHeatRationale()}
                onOpenWhyDialog={() => setHeatDialogOpen(true)}
                whyDialogOpen={heatDialogOpen}
                level={level}
              />
            </div>
          }
        />



        <Button
          variant="gold"
          size="pill"
          className="mt-4"
          onClick={() => {
            // Require the user to have logged at least one step (done OR
            // skipped) so wash days aren't saved entirely empty.
            const allStates = [prePoo, cleanse, coWash, condition, treatment];
            const anyAnswered = allStates.some((s) => s === "done" || s === "skipped");
            if (!anyAnswered) {
              toast.error("Add or skip at least one step before continuing");
              return;
            }
            // Only save products from steps that were actually completed.
            // We persist the user_product IDs (used by Step3 to attach
            // products to the saved wash record) and a human-readable list
            // for any UI that wants to show them inline.
            const productIds: string[] = [];
            const productLabels: string[] = [];
            const collect = (ids: string[]) => {
              productIds.push(...ids);
              productLabels.push(...resolve(ids).map(formatProduct));
            };
            if (prePoo === "done") collect(prePooIds);
            if (cleanse === "done") collect(cleanseIds);
            if (coWash === "done") collect(coWashIds);
            if (condition === "done") collect(conditionIds);
            if (treatment === "done") collect(treatmentIds);
            // Heat is captured per step. Build one entry per step that was
            // answered, then roll them up into the single log-level shape the
            // AI insight generation and existing readers expect.
            const stepHeat = (
              choice: HeatChoice,
              minutes: number | null,
              ids: string[],
            ): StepHeat | null => {
              if (!choice) return null;
              if (choice === "no") return { used: false };
              return {
                used: true,
                ...(minutes ? { duration_min: minutes } : {}),
                ...(ids.length ? { tool_ids: ids, tools: toolNames(ids) } : {}),
              };
            };
            const heatByStep: Record<string, StepHeat | null> = {
              Condition: condition === "done" ? stepHeat(heatChoice, heatMinutes, heatToolIds) : null,
              Treatment:
                treatment === "done"
                  ? stepHeat(treatmentHeatChoice, treatmentHeatMinutes, treatmentHeatToolIds)
                  : null,
            };
            const rolledHeat = rollUpStepHeat(Object.values(heatByStep).map((heat) => ({ heat })));
            localStorage.setItem(
              "strand_wash_step1",
              JSON.stringify({
                // Persist explicit done/skipped state so the rest of the flow
                // and the saved wash record can reflect what was skipped.
                prePoo, cleanse, coWash, condition, treatment,
                treatmentType,
                products: productLabels,
                productIds,
                // Per-step heat, plus the log-level roll-up kept in the legacy
                // keys so nothing downstream regresses.
                heatByStep,
                heatTreatment: rolledHeat ? (rolledHeat.used ? "yes" : "no") : null,
                heatMinutes: rolledHeat?.duration_min ?? null,
                heatToolIds: rolledHeat?.tool_ids ?? [],
                heatToolNames: rolledHeat?.tools ?? [],

                skipped: {
                  prePoo: prePoo === "skipped",
                  cleanse: cleanse === "skipped",
                  coWash: coWash === "skipped",
                  condition: condition === "skipped",
                  treatment: treatment === "skipped",
                },
              }),
            );
            // Draft is no longer needed once we've moved on to step 2.
            localStorage.removeItem("strand_wash_step1_draft");
            navigate("/wash/step-2");
          }}
        >
          Next — Scalp & Results →
        </Button>
      </div>

      <Dialog open={heatDialogOpen} onOpenChange={setHeatDialogOpen}>
        <DialogContent className="max-w-[92vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className="size-5 text-primary" />
              {heatLoading ? "Pulling your data…" : heatRationale?.headline ?? "Why heat could help"}
            </DialogTitle>
            <DialogDescription>
              Personalised to your hair profile, goals and recent wash notes — not generic advice.
            </DialogDescription>
          </DialogHeader>
          {heatLoading ? (
            <div className="py-6 flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2 className="size-4 animate-spin" /> Building your rationale…
            </div>
          ) : heatRationale?.reasons?.length ? (
            <div className="space-y-2.5 py-1">
              {(() => {
                const { phrase, rest } = emphasisSplit(heatRationale.reasons[0]);
                return (
                  <p className="text-sm leading-relaxed">
                    <span className="font-semibold text-foreground">{phrase}</span>{" "}
                    <span className="text-foreground/75">{rest}</span>
                  </p>
                );
              })()}
              {heatRationale.reasons.length > 1 && (
                <ActionList
                  actions={heatRationale.reasons.slice(1).map((r) => ({ action: r }))}
                  showWhy={false}
                  idPrefix="heat-dialog-reason"
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              We couldn't generate a personalised reason this time. Try again after logging a bit more about your hair.
            </p>
          )}

          {/* Affiliate CTA — let the user buy a TT Heat Hat right from the rationale,
              with the Strand-only discount code shown directly underneath. */}
          <div className="pt-2 space-y-1.5">
            <Button
              asChild
              variant="gold"
              size="pill"
              className="w-full"
            >
              <a
                href="https://www.teamtexture.co.uk"
                target="_blank"
                rel="noopener noreferrer"
              >
                Buy a TT Heat Hat
              </a>
            </Button>
            <p className="text-[11px] text-center uppercase tracking-[0.15em] text-primary font-medium">
              Use discount code STRAND10 for 10% off
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="pill"
              onClick={() => setHeatDialogOpen(false)}
              className="flex-1"
            >
              Maybe next time
            </Button>
            <Button
              variant="gold"
              size="pill"
              onClick={() => {
                setHeatChoice("yes");
                setHeatDialogOpen(false);
              }}
              className="flex-1"
            >
              I'll add one
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline product picker — shared across all steps. Lets the user pick
          existing shelf/wishlist products OR add a brand new one (photo /
          upload / link). New products are saved straight to the shelf via
          auto_save and the user is returned here, where the new product
          shows up in the shelf list and can be toggled into the step. */}
      <ProductPickerSheet
        open={pickerOpen}
        onOpenChange={(o) => {
          setPickerOpen(o);
          if (!o) {
            setPickerTarget(null);
            // Drop the picker target from the URL once the sheet closes so
            // the auto-merge effect doesn't fire again on subsequent visits.
            const next = new URLSearchParams(searchParams);
            if (next.has("picker")) {
              next.delete("picker");
              setSearchParams(next, { replace: true });
            }
          }
        }}
        selectedIds={pickerTarget ? targetIds[pickerTarget] : []}
        stepHint={pickerTarget}
        onToggle={handleTogglePicked}

      />
    </ScreenLayout>
  );
};

export default WashStep1;
