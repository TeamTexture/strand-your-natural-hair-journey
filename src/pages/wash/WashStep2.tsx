import { smartBack } from "@/lib/smartBack";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, Droplets, Flame, Wind, Sparkles, CheckCircle2, AlertTriangle, MinusCircle, XCircle } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import StepProgress from "@/components/nav/StepProgress";
import Eyebrow from "@/components/nav/Eyebrow";
import ChoiceChips, { type Choice } from "@/components/nav/ChoiceChips";
import SurfaceCard from "@/components/SurfaceCard";
import LevelGate from "@/components/tips/LevelGate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ICONS } from "@/lib/iconMap";
import { readWashDraft, writeWashDraft } from "@/lib/washDraft";
import { useWashDraftHydration } from "@/hooks/useWashDraftHydration";
import { useEffect } from "react";

const SCALP_OPTIONS: Choice[] = [
  { value: "Clean", label: "Clean", icon: CheckCircle2 },
  { value: "Itchy", label: "Itchy", icon: AlertTriangle },
  { value: "Tender", label: "Tender", icon: AlertCircle },
  { value: "Dry / flaky", label: "Dry / flaky", icon: Wind },
  { value: "Greasy", label: "Greasy", icon: Droplets },
  { value: "Balanced", label: "Balanced", icon: Sparkles },
];

const BREAKAGE_OPTIONS: Choice[] = [
  { value: "None", label: "None", icon: CheckCircle2 },
  { value: "Minimal — normal shedding", label: "Minimal — normal shedding", icon: MinusCircle },
  { value: "Moderate", label: "Moderate", icon: ICONS.breakage },
  { value: "A lot — concerned", label: "A lot — concerned", icon: XCircle },
];

const MultiChoiceField = ({
  label,
  icon,
  options,
  value,
  onChange,
  error = false,
}: {
  label: string;
  icon: LucideIcon;
  options: Choice[];
  value: string[];
  onChange: (n: string[]) => void;
  error?: boolean;
}) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <Eyebrow icon={icon} tone={error ? "warning" : "gold"}>{label}</Eyebrow>
      <span className={cn("text-[11px] font-medium", error ? "text-destructive" : "text-primary")}>*</span>
    </div>
    <div className={cn(error && "ring-1 ring-destructive/40 rounded-[12px] p-1.5 -m-1.5")}>
      <ChoiceChips
        options={options}
        value={value}
        multiple
        columns={2}
        onChange={(v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])}
      />
    </div>
    {error && (
      <p className="mt-1.5 text-[11px] text-destructive flex items-center gap-1">
        <AlertCircle className="size-3" /> Pick at least one
      </p>
    )}
  </div>
);

const WashStep2 = () => {
  const navigate = useNavigate();
  const [scalp, setScalp] = useState<string[]>([]);
  const [breakage, setBreakage] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  // Seed from whatever was already captured for this log — locally or on the
  // durable copy — so coming back to this screen never wipes her answers.
  const { ready: draftReady } = useWashDraftHydration();
  useEffect(() => {
    if (!draftReady) return;
    const saved = readWashDraft<{ scalp?: string[]; breakage?: string[] }>("strand_wash_step2", {});
    if (saved.scalp?.length) setScalp((cur) => (cur.length ? cur : saved.scalp!));
    if (saved.breakage?.length) setBreakage((cur) => (cur.length ? cur : saved.breakage!));
  }, [draftReady]);

  const errors = {
    scalp: scalp.length === 0,
    breakage: breakage.length === 0,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleNext = () => {
    if (hasErrors) {
      setSubmitted(true);
      toast.error("Pick at least one option in each section");
      return;
    }
    writeWashDraft("strand_wash_step2", { scalp, breakage });
    navigate("/wash/step-3");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" onBack={smartBack(navigate, "/wash/step-1")} />
      <div className="px-5 pt-1 pb-3"><StepProgress current={2} total={5} label="Scalp & breakage" /></div>

      <div className="px-5 pb-8 space-y-5">
        <LevelGate min={2} fallback={
          <p className="text-[11px] text-muted-foreground">Pick what stands out most.</p>
        }>
          <p className="text-[11px] text-muted-foreground">
            How did your scalp and strands feel through this wash?
          </p>
        </LevelGate>
        <MultiChoiceField label="Scalp Feel" icon={ICONS.scalp} options={SCALP_OPTIONS} value={scalp} onChange={setScalp} error={submitted && errors.scalp} />
        <MultiChoiceField label="Breakage" icon={ICONS.breakage} options={BREAKAGE_OPTIONS} value={breakage} onChange={setBreakage} error={submitted && errors.breakage} />

        <Button
          variant="gold"
          size="pill"
          className="mt-4"
          onClick={handleNext}
        >
          Next — How Did It Feel? →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default WashStep2;
