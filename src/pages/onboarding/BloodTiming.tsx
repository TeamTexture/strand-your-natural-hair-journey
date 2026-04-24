import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const opts = [
  { id: 1, t: "Within the last month", s: "You can input your results now" },
  { id: 2, t: "1-3 months ago", s: "Results accepted — retest reminder set" },
  { id: 3, t: "3-6 months ago", s: "Accepted but flagged — retest recommended within 30 days" },
  { id: 4, t: "Over 6 months ago / never tested", s: "We will help you book or order a kit" },
];

const BloodTiming = () => {
  const navigate = useNavigate();
  const [choice, setChoice] = useState<number>(1);

  return (
    <ScreenLayout>
      <TitleBar title="Blood Test" right={<span>7 of 9</span>} />
      <ProgressDots total={9} current={7} />

      <div className="px-5 pb-8 space-y-4">
        <h2 className="font-display text-[22px] leading-tight text-center pt-2">
          When did you last have a blood test?
        </h2>
        <ItalicSub>
          Blood deficiencies are one of the most overlooked causes of hair shedding and slow growth.
        </ItalicSub>

        <div className="space-y-3">
          {opts.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setChoice(o.id)}
              className={cn(
                "w-full text-left p-4 rounded-[14px] border bg-card transition-colors",
                choice === o.id ? "border-primary border-2" : "border-border",
              )}
            >
              <p className="text-sm font-medium font-body">{o.t}</p>
              <p className="text-xs text-muted-foreground mt-1">{o.s}</p>
            </button>
          ))}
        </div>

        {choice === 4 && (
          <SurfaceCard tone="gold">
            <p className="font-display text-base font-semibold mb-1">Order with Daye — At-Home Kit</p>
            <p className="text-xs text-foreground/80 mb-3">
              Full hair and scalp blood panel. Results in 5 days. Exclusive Strand member discount.
            </p>
            <span className="inline-block bg-primary text-primary-foreground text-[11px] tracking-[0.2em] font-medium px-3 py-1.5 rounded">
              STRAND20
            </span>
          </SurfaceCard>
        )}

        <Button variant="gold" size="pill" className="mt-4" onClick={() => navigate("/onboarding/blood-iron-vitamins")}>
          Input My Results →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BloodTiming;
