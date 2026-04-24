import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, Flame, Loader2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
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

interface Step {
  id: string;
  emoji: string;
  name: string;
  sub: string;
  defaultDone: boolean;
  products: string[];
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
  /** What to render inside the inline editor (only visible while state === "editing"). */
  editor,
  /**
   * Optional collapsed summary chips shown under the header once the step is "done".
   * If omitted we just show the default product list captured for this step.
   */
  summaryChips,
}: {
  step: Step;
  state: StepState;
  setState: (s: StepState) => void;
  editor?: React.ReactNode;
  summaryChips?: string[];
}) => {
  const isEditing = state === "editing";
  const isDone = state === "done";
  const isSkipped = state === "skipped";
  // Use caller-provided chips when given; otherwise fall back to the step's
  // default product list so a "done" step is never visually empty.
  const chips = summaryChips ?? step.products;
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
              // Toggle: todo → editing, editing → todo (cancel), done → editing (re-open to edit)
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

      {/* EDITING: inline editor with the per-step UI + a Done button to commit */}
      {isEditing && (
        <div className="mt-3 space-y-2">
          {step.products.map((p) => (
            <div key={p} className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/30 rounded-[10px]">
              <Check className="size-4 text-good shrink-0" />
              <span className="text-xs flex-1 truncate">{p}</span>
            </div>
          ))}
          <button className="w-full text-left px-3 py-2 border border-dashed border-border rounded-[10px] text-xs text-muted-foreground">
            + Add product used
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

// Heat-treatment selection inside the Condition step.
//   - "yes": user used a heat treatment (cap / steamer / hooded dryer over conditioner)
//   - "no":  user explicitly didn't — triggers a personalised AI explainer
//   - null:  not yet answered
type HeatChoice = "yes" | "no" | null;

interface HeatRationale {
  headline: string;
  reasons: string[];
}

const WashStep1 = () => {
  const navigate = useNavigate();
  const [prePoo, setPrePoo] = useState<StepState>("done");
  const [cleanse, setCleanse] = useState<StepState>("done");
  const [condition, setCondition] = useState<StepState>("done");
  const [treatment, setTreatment] = useState<StepState>("todo");
  
  const [treatmentType, setTreatmentType] = useState<string[]>([]);

  // Heat-treatment state lives at the page level so we can persist it and so
  // the "why" dialog can read/write the choice.
  const [heatChoice, setHeatChoice] = useState<HeatChoice>(null);
  const [heatDialogOpen, setHeatDialogOpen] = useState(false);
  const [heatRationale, setHeatRationale] = useState<HeatRationale | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);

  // Fetch a personalised "why heat could help YOU" explanation grounded in the
  // user's hair profile, goals, challenges and recent wash history. Cached for
  // the lifetime of the component so re-opening the dialog is instant.
  const handleHeatNo = async () => {
    setHeatChoice("no");
    setHeatDialogOpen(true);
    if (heatRationale) return;
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

  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" right={<span>1 of 4</span>} onBack={() => navigate("/wash-day")} />
      <ProgressDots total={4} current={1} />
      <ItalicSub>
        Tap <strong>Add</strong> for steps you did and <strong>Skip</strong> for steps you didn't — be honest, it makes your history more useful.
      </ItalicSub>

      <div className="px-5 space-y-3 pb-8">
        <StepCard
          step={{ id: "1", emoji: "🌿", name: "Pre-Poo", sub: "Pre-wash treatment", defaultDone: true, products: [] }}
          state={prePoo}
          setState={setPrePoo}
        />
        <StepCard
          step={{ id: "2", emoji: "💧", name: "Cleanse", sub: "Shampoo / co-wash", defaultDone: true, products: ["Moisture Retention Shampoo — Camille Rose"] }}
          state={cleanse}
          setState={setCleanse}
        />
        <StepCard
          step={{ id: "3", emoji: "🫧", name: "Condition", sub: "Rinse-out or deep conditioner", defaultDone: true, products: ["Honey & Turmeric Deep Cond — TGIN"] }}
          state={condition}
          setState={setCondition}
          // Once Done, surface the conditioner + the heat-treatment answer as chips
          // so the user can see at a glance what they captured for this step.
          summaryChips={[
            "Honey & Turmeric Deep Cond — TGIN",
            ...(heatChoice === "yes" ? ["Heat treatment"] : []),
            ...(heatChoice === "no" ? ["No heat"] : []),
          ]}
          editor={
            <div className="px-3 py-2.5 bg-primary/5 border border-primary/30 rounded-[10px] space-y-2">
              <div className="flex items-center gap-2">
                <Flame className="size-4 text-primary" />
                <span className="text-xs font-medium flex-1">Did you use a heat treatment?</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHeatChoice("yes")}
                  aria-pressed={heatChoice === "yes"}
                  className={cn(
                    "flex-1 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors min-h-[36px]",
                    heatChoice === "yes"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border",
                  )}
                >
                  Yes ✓
                </button>
                <button
                  type="button"
                  onClick={handleHeatNo}
                  aria-pressed={heatChoice === "no"}
                  className={cn(
                    "flex-1 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors min-h-[36px]",
                    heatChoice === "no"
                      ? "bg-muted text-foreground border-border"
                      : "bg-card text-muted-foreground border-border",
                  )}
                >
                  No
                </button>
              </div>
              {heatChoice === "yes" && (
                <p className="text-[11px] text-muted-foreground">
                  Nice — log the cap/steamer and minutes on the next step.
                </p>
              )}
              {heatChoice === "no" && !heatDialogOpen && (
                <button
                  type="button"
                  onClick={() => setHeatDialogOpen(true)}
                  className="text-[11px] text-primary underline underline-offset-2"
                >
                  Why heat could help your hair →
                </button>
              )}
            </div>
          }
        />
        <StepCard
          step={{ id: "4", emoji: "🧬", name: "Treatment", sub: "Optional — only when needed", defaultDone: false, products: [] }}
          state={treatment}
          setState={setTreatment}
          // The treatment chips are exactly what the user picked in the editor —
          // so pressing Done collapses the card and shows e.g. "Bond repair" beneath it.
          summaryChips={treatmentType}
          editor={
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
          }
        />


        <Button
          variant="gold"
          size="pill"
          className="mt-4"
          onClick={() => {
            // Only save products from steps that were actually completed.
            const products: string[] = [];
            if (cleanse === "done") products.push("Moisture Retention Shampoo — Camille Rose");
            if (condition === "done") products.push("Honey & Turmeric Deep Cond — TGIN");
            if (style === "done") products.push("Flaxseed Styling Gel — Camille Rose");
            localStorage.setItem(
              "strand_wash_step1",
              JSON.stringify({
                // Persist explicit done/skipped state so the rest of the flow
                // and the saved wash record can reflect what was skipped.
                prePoo, cleanse, condition, treatment, style,
                treatmentType,
                products,
                heatTreatment: heatChoice,
                skipped: {
                  prePoo: prePoo === "skipped",
                  cleanse: cleanse === "skipped",
                  condition: condition === "skipped",
                  treatment: treatment === "skipped",
                  style: style === "skipped",
                },
              }),
            );
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
          ) : (
            <ul className="space-y-2.5 py-1">
              {(heatRationale?.reasons ?? []).map((r, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-primary mt-0.5">•</span>
                  <span className="flex-1">{r}</span>
                </li>
              ))}
              {(!heatRationale?.reasons || heatRationale.reasons.length === 0) && !heatLoading && (
                <li className="text-sm text-muted-foreground">
                  We couldn't generate a personalised reason this time. Try again after logging a bit more about your hair.
                </li>
              )}
            </ul>
          )}
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
    </ScreenLayout>
  );
};

export default WashStep1;
