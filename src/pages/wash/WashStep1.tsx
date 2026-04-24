import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import Tag from "@/components/Tag";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  emoji: string;
  name: string;
  sub: string;
  defaultDone: boolean;
  products: string[];
}

const StepCard = ({
  step,
  done, setDone,
  children,
}: {
  step: Step; done: boolean; setDone: (b: boolean) => void;
  children?: React.ReactNode;
}) => (
  <SurfaceCard>
    <div className="flex items-center gap-3">
      <div className="size-10 rounded-[10px] bg-primary/15 flex items-center justify-center text-xl">
        {step.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display text-base font-semibold leading-tight">{step.name}</p>
        <p className="text-[11px] text-muted-foreground">{step.sub}</p>
      </div>
      <button
        onClick={() => setDone(!done)}
        className={cn(
          "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
          done ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border",
        )}
      >
        {done ? "Done ✓" : "Add"}
      </button>
    </div>
    {done && (
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

const WashStep1 = () => {
  const navigate = useNavigate();
  const [prePoo, setPrePoo] = useState(true);
  const [cleanse, setCleanse] = useState(true);
  const [condition, setCondition] = useState(true);
  const [treatment, setTreatment] = useState(false);
  const [style, setStyle] = useState(true);
  const [treatmentType, setTreatmentType] = useState<string[]>([]);

  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" right={<span>1 of 4</span>} onBack={() => navigate("/wash-day")} />
      <ProgressDots total={4} current={1} />
      <ItalicSub>Which steps did you do today? Tap each to log — then add the products used.</ItalicSub>

      <div className="px-5 space-y-3 pb-8">
        <StepCard
          step={{ id: "1", emoji: "🌿", name: "Pre-Poo", sub: "Pre-wash treatment", defaultDone: true, products: [] }}
          done={prePoo} setDone={setPrePoo}
        />
        <StepCard
          step={{ id: "2", emoji: "💧", name: "Cleanse", sub: "Shampoo / co-wash", defaultDone: true, products: ["Moisture Retention Shampoo — Camille Rose"] }}
          done={cleanse} setDone={setCleanse}
        />
        <StepCard
          step={{ id: "3", emoji: "🫧", name: "Condition", sub: "Rinse-out or deep conditioner", defaultDone: true, products: ["Honey & Turmeric Deep Cond — TGIN"] }}
          done={condition} setDone={setCondition}
        >
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/15 border border-primary/30 rounded-[10px]">
            <span className="text-base">🔥</span>
            <span className="text-xs flex-1">Heat Treatment · TT Heat Hat · 25 mins ✓</span>
            <button className="text-xs text-primary uppercase tracking-[0.15em]">Edit</button>
          </div>
        </StepCard>
        <StepCard
          step={{ id: "4", emoji: "🧬", name: "Treatment", sub: "Optional — only when needed", defaultDone: false, products: [] }}
          done={treatment} setDone={setTreatment}
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
          done={style} setDone={setStyle}
        />

        <Button variant="gold" size="pill" className="mt-4" onClick={() => navigate("/wash/step-2")}>
          Next — Scalp & Results →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default WashStep1;
