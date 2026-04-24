import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import Tag from "@/components/Tag";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TG = ({
  label,
  options,
  value,
  onChange,
  required = false,
  error = false,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (n: string[]) => void;
  required?: boolean;
  error?: boolean;
}) => (
  <div>
    <div className="text-[11px] uppercase tracking-[0.18em] font-body mb-2 flex items-center gap-1.5">
      <span className={cn(error ? "text-destructive" : "text-muted-foreground")}>{label}</span>
      {required && <span className={cn(error ? "text-destructive" : "text-primary")}>*</span>}
    </div>
    <div className={cn("flex flex-wrap gap-2", error && "ring-1 ring-destructive/40 rounded-[10px] p-1.5 -m-1.5")}>
      {options.map((o) => (
        <Tag
          key={o}
          selected={value.includes(o)}
          onClick={() => onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o])}
        >
          {o}
        </Tag>
      ))}
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
  // Default to empty so the screen reflects what the user actually picks,
  // not pre-selected hardcoded answers.
  const [scalp, setScalp] = useState<string[]>([]);
  const [breakage, setBreakage] = useState<string[]>([]);
  const [style, setStyle] = useState<string[]>([]);
  const [duration, setDuration] = useState<string[]>([]);
  const [stress, setStress] = useState<string[]>([]);
  // Track whether the user has tried to submit so we only show errors after
  // the first attempt rather than on initial load.
  const [submitted, setSubmitted] = useState(false);

  const errors = {
    scalp: scalp.length === 0,
    breakage: breakage.length === 0,
    style: style.length === 0,
    duration: duration.length === 0,
    stress: stress.length === 0,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleNext = () => {
    if (hasErrors) {
      setSubmitted(true);
      toast.error("Pick at least one option in each section");
      return;
    }
    localStorage.setItem(
      "strand_wash_step2",
      JSON.stringify({ scalp, breakage, style, duration, stress }),
    );
    navigate("/wash/step-3");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" right={<span>2 of 4</span>} onBack={() => navigate("/wash/step-1")} />
      <ProgressDots total={4} current={2} />

      <div className="px-5 pb-8 space-y-5">
        <p className="text-[11px] text-muted-foreground">
          All sections required — pick at least one tag per question so your wash history stays useful.
        </p>
        <TG label="Scalp Feel" options={["Clean", "Itchy", "Tender", "Dry / flaky", "Greasy", "Balanced"]} value={scalp} onChange={setScalp} required error={submitted && errors.scalp} />
        <TG label="Breakage" options={["None", "Minimal — normal shedding", "Moderate", "A lot — concerned"]} value={breakage} onChange={setBreakage} required error={submitted && errors.breakage} />
        <TG label="Style After" options={["Wash and go", "Twist-out", "Braid-out", "Finger comb coils", "Loose afro", "Back into braids", "Silk press", "Wig / unit", "Protective style"]} value={style} onChange={setStyle} required error={submitted && errors.style} />
        <TG label="Duration" options={["Under 1 hour", "1-2 hours", "2-3 hours", "3-4 hours", "4+ hours"]} value={duration} onChange={setDuration} required error={submitted && errors.duration} />
        <TG label="Stress This Week" options={["Low", "Moderate", "High"]} value={stress} onChange={setStress} required error={submitted && errors.stress} />

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
