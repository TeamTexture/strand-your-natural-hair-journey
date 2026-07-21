import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, ExternalLink, Stethoscope, Upload } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DAYE_URL = "https://www.yourdaye.com/products/hormone-test/";
const DAYE_CODE = "STRAND20";
const LOLA_URL = "https://lolahealth.com/?srsltid=AfmBOopC3BcYrhp3GEEOOo1kCw-uXtlfLw6cfcDaHrkXcso14m5rdtDx";

const BloodTiming = () => {
  const navigate = useNavigate();
  const [choice, setChoice] = useState<"yes" | "no">("yes");

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
          Have you had a blood test in the last 6 months?
        </h2>
        <ItalicSub>
          Blood deficiencies are one of the most overlooked causes of hair shedding and slow growth.
        </ItalicSub>

        <SurfaceCard tone="gold">
          <p className="text-sm font-body leading-snug">
            <span className="font-semibold">A recent blood test is required to unlock STRAND.</span>{" "}
            Your results power every piece of guidance — from your nutrition plan to your wash-day tips.
          </p>
        </SurfaceCard>

        <div className="space-y-3">
          {(["yes", "no"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setChoice(v)}
              className={cn(
                "w-full text-left p-4 rounded-[14px] border bg-card transition-colors",
                choice === v ? "border-primary border-2" : "border-border",
              )}
            >
              <p className="text-sm font-medium font-body">
                {v === "yes"
                  ? "Yes — within the last 6 months"
                  : "No — it's older than 6 months or I've never tested"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {v === "yes"
                  ? "You'll upload or enter your results next"
                  : "We'll help you book a test — your profile stays saved"}
              </p>
            </button>
          ))}
        </div>

        {choice === "no" ? (
          <>
            <SurfaceCard tone="orange">
              <p className="text-sm font-body leading-snug">
                You'll need recent blood work to unlock STRAND. Book with a vetted
                professional below — your profile will be waiting when you're ready.
              </p>
            </SurfaceCard>

            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={() => navigate("/directory?bloodOnly=1")}
            >
              <Stethoscope className="size-4 mr-1.5" />
              See verified doctors →
            </Button>

            <SurfaceCard tone="gold">
              <p className="font-display text-base font-semibold mb-1">
                Or — order an at-home kit with Daye
              </p>
              <p className="text-xs text-foreground/80 mb-3 font-body">
                Full hair & scalp blood panel posted to your door. Results in 5 days.
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
          <div className="space-y-3 mt-4">
            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={() => navigate("/blood-upload?onboarding=1")}
            >
              <Upload className="size-4 mr-1.5" />
              Upload PDF or Photo
            </Button>
            <Button
              variant="goldOutline"
              size="pill"
              className="w-full"
              onClick={() => navigate("/onboarding/blood-iron-vitamins")}
            >
              Input Manually →
            </Button>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default BloodTiming;
