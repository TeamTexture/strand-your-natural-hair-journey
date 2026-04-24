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
 * Each step has three states so people can be honest about what they actually did:
 *   - "todo"    — not yet logged (default)
 *   - "done"    — completed; show products & extras
 *   - "skipped" — explicitly didn't do it today (logged for accuracy, no products saved)
 *
 * "Skipped" steps still get recorded in the saved payload so the user's history
 * reflects what was deliberately omitted, not just what's missing.
 */
type StepState = "todo" | "done" | "skipped";

const StepCard = ({
  step,
  state,
  setState,
  children,
}: {
  step: Step;
  state: StepState;
  setState: (s: StepState) => void;
  children?: React.ReactNode;
}) => {
  const isDone = state === "done";
  const isSkipped = state === "skipped";
  return (
    <SurfaceCard className={cn(isSkipped && "opacity-70")}>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "size-10 rounded-[10px] flex items-center justify-center text-xl",
            isSkipped ? "bg-muted" : "bg-primary/15",
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
            {isSkipped ? "Skipped today" : step.sub}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setState(isDone ? "todo" : "done")}
            aria-pressed={isDone}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors min-h-[32px]",
              isDone
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border",
            )}
          >
            {isDone ? "Done ✓" : "Add"}
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
      {isDone && (
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
          {children}
        </div>
      )}
    </SurfaceCard>
  );
};

const WashStep1 = () => {
  const navigate = useNavigate();
  const [prePoo, setPrePoo] = useState<StepState>("done");
  const [cleanse, setCleanse] = useState<StepState>("done");
  const [condition, setCondition] = useState<StepState>("done");
  const [treatment, setTreatment] = useState<StepState>("todo");
  const [style, setStyle] = useState<StepState>("done");
  const [treatmentType, setTreatmentType] = useState<string[]>([]);

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
        >
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/15 border border-primary/30 rounded-[10px]">
            <span className="text-base">🔥</span>
            <span className="text-xs flex-1">Heat Treatment · TT Heat Hat · 25 mins ✓</span>
            <button className="text-xs text-primary uppercase tracking-[0.15em]">Edit</button>
          </div>
        </StepCard>
        <StepCard
          step={{ id: "4", emoji: "🧬", name: "Treatment", sub: "Optional — only when needed", defaultDone: false, products: [] }}
          state={treatment}
          setState={setTreatment}
        >
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
        </StepCard>
        <StepCard
          step={{ id: "5", emoji: "✨", name: "Style & Finish", sub: "Styling products applied", defaultDone: true, products: ["Flaxseed Styling Gel — Camille Rose"] }}
          state={style}
          setState={setStyle}
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
    </ScreenLayout>
  );
};

export default WashStep1;
