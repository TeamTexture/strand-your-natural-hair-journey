import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, ExternalLink, Stethoscope } from "lucide-react";
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

const DAYE_URL = "https://www.yourdaye.com/products/hormone-test/";
const DAYE_CODE = "STRAND20";

const BloodTiming = () => {
  const navigate = useNavigate();
  const [choice, setChoice] = useState<number>(1);

  // Choices 3 (3-6 months) and 4 (over 6 months / never) mean the bloods are
  // too old / missing — we steer the user to retest before inputting results.
  const needsRetest = choice === 3 || choice === 4;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(DAYE_CODE);
      toast.success(`✓ Code ${DAYE_CODE} copied`);
    } catch {
      toast(`Code: ${DAYE_CODE}`);
    }
  };

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

        {needsRetest ? (
          <>
            <SurfaceCard tone="orange">
              <p className="text-sm font-body leading-snug">
                Your last blood work is too old to give us an accurate read. Pick one of the
                two options below to retest before continuing.
              </p>
            </SurfaceCard>

            {/* Option A — Book a doctor (deep-link to dermatologists in directory) */}
            <SurfaceCard>
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Stethoscope className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base font-semibold mb-1">
                    Book a Doctor
                  </p>
                  <p className="text-xs text-foreground/80 mb-3 font-body">
                    See a verified dermatologist who can run the full blood panel we need
                    for hair-loss screening.
                  </p>
                  <Button
                    variant="goldOutline"
                    size="pill"
                    className="w-full"
                    onClick={() => navigate("/directory?bloodOnly=1")}
                  >
                    See verified doctors →
                  </Button>
                </div>
              </div>
            </SurfaceCard>

            {/* Option B — Daye at-home kit */}
            <SurfaceCard tone="gold">
              <p className="font-display text-base font-semibold mb-1">
                Order with Daye — At-Home Kit
              </p>
              <p className="text-xs text-foreground/80 mb-3 font-body">
                Full hair and scalp blood panel posted to your door. Results in 5 days.
                Exclusive Strand member discount.
              </p>
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-[11px] tracking-[0.2em] font-medium px-3 py-1.5 rounded hover:bg-primary/90 transition-colors min-h-[36px]"
                aria-label={`Copy discount code ${DAYE_CODE}`}
              >
                {DAYE_CODE}
                <Copy className="size-3" />
              </button>

              <a
                href={DAYE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-full px-5 py-3 text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
              >
                Order Your Daye Kit
                <ExternalLink className="size-4" />
              </a>
            </SurfaceCard>

            <Button
              variant="goldGhost"
              size="pill"
              onClick={() => navigate("/onboarding/blood-iron-vitamins")}
            >
              Skip for now — input what I have
            </Button>
          </>
        ) : (
          <Button
            variant="gold"
            size="pill"
            className="mt-4"
            onClick={() => navigate("/onboarding/blood-iron-vitamins")}
          >
            Input My Results →
          </Button>
        )}
      </div>
    </ScreenLayout>
  );
};

export default BloodTiming;
