import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Subtitles intentionally removed — describing what each option unlocks
// could nudge people to misreport when they last tested just to gain
// access. We keep the timing options neutral.
const opts = [
  { id: 1, t: "Within the last month" },
  { id: 2, t: "1-3 months ago" },
  { id: 3, t: "3-6 months ago" },
  { id: 4, t: "Over 6 months ago / never tested" },
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
            </button>
          ))}
        </div>

        {choice === 4 && (
          <SurfaceCard tone="gold">
            <p className="font-display text-base font-semibold mb-1">Order with Daye — At-Home Kit</p>
            <p className="text-xs text-foreground/80 mb-3">
              Full hair and scalp blood panel. Results in 5 days. Exclusive Strand member discount.
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText("STRAND20");
                  toast.success("✓ Code STRAND20 copied");
                } catch {
                  toast("Code: STRAND20");
                }
              }}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-[11px] tracking-[0.2em] font-medium px-3 py-1.5 rounded hover:bg-primary/90 transition-colors min-h-[36px]"
              aria-label="Copy discount code STRAND20"
            >
              STRAND20
              <Copy className="size-3" />
            </button>

            <Button
              variant="gold"
              size="pill"
              className="w-full mt-3"
              onClick={() =>
                window.open("https://www.yourdaye.com", "_blank", "noopener,noreferrer")
              }
            >
              Order Your Daye Kit
              <ExternalLink className="size-4 ml-1" />
            </Button>
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
