import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import Tag from "@/components/Tag";
import { Button } from "@/components/ui/button";

const TG = ({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (n: string[]) => void }) => (
  <div>
    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">{label}</div>
    <div className="flex flex-wrap gap-2">
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
  </div>
);

const WashStep2 = () => {
  const navigate = useNavigate();
  const [scalp, setScalp] = useState(["Clean"]);
  const [breakage, setBreakage] = useState(["Minimal — normal shedding"]);
  const [style, setStyle] = useState(["Wash and go"]);
  const [duration, setDuration] = useState(["2-3 hours"]);
  const [stress, setStress] = useState(["Moderate"]);

  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" right={<span>2 of 4</span>} onBack={() => navigate("/wash/step-1")} />
      <ProgressDots total={4} current={2} />

      <div className="px-5 pb-8 space-y-5">
        <TG label="Scalp Feel" options={["Clean", "Itchy", "Tender", "Dry / flaky", "Greasy", "Balanced"]} value={scalp} onChange={setScalp} />
        <TG label="Breakage" options={["None", "Minimal — normal shedding", "Moderate", "A lot — concerned"]} value={breakage} onChange={setBreakage} />
        <TG label="Style After" options={["Wash and go", "Twist-out", "Braid-out", "Finger comb coils", "Loose afro", "Back into braids", "Silk press", "Wig / unit", "Protective style"]} value={style} onChange={setStyle} />
        <TG label="Duration" options={["Under 1 hour", "1-2 hours", "2-3 hours", "3-4 hours", "4+ hours"]} value={duration} onChange={setDuration} />
        <TG label="Stress This Week" options={["Low", "Moderate", "High"]} value={stress} onChange={setStress} />

        <Button
          variant="gold"
          size="pill"
          className="mt-4"
          onClick={() => {
            localStorage.setItem(
              "strand_wash_step2",
              JSON.stringify({ scalp, breakage, style, duration, stress }),
            );
            navigate("/wash/step-3");
          }}
        >
          Next — How Did It Feel? →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default WashStep2;
