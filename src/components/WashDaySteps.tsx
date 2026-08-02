// The user's personalised wash day sequence. Generated at runtime from the
// manuscript-grounded pipeline — never static copy, so there is no fallback
// text when generation fails.

import { Droplets, RefreshCw } from "lucide-react";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import StepSequence from "@/components/guidance/StepSequence";
import TipsLevelPrompt from "@/components/TipsLevelPrompt";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { useWashDaySteps } from "@/hooks/useWashDaySteps";

const WashDaySteps = ({ className }: { className?: string }) => {
  const { data: steps, isLoading, isError, refetch, isFetching } = useWashDaySteps();

  return (
    <div className={className}>
      <GuidanceCard
        eyebrow="Your wash day, step by step"
        icon={Droplets}
        tone="gold"
        footer={steps && steps.length > 0 ? <TipsLevelPrompt /> : undefined}
      >
        {isLoading ? (
          <div className="py-2">
            <LoadingDot />
            <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
              Writing your steps for your hair…
            </p>
          </div>
        ) : isError ? (
          <div>
            <p className="text-[12px] leading-relaxed text-foreground/85">
              Your steps could not be prepared just now.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={isFetching}
              onClick={() => refetch()}
            >
              <RefreshCw className="size-3.5 mr-1.5" />
              Try again
            </Button>
          </div>
        ) : steps && steps.length > 0 ? (
          <StepSequence
            steps={steps.map((s) => ({
              text: s.headline,
              detail: s.product_ref
                ? `${s.body} Use your ${s.product_ref}.`.replace(/\s+/g, " ")
                : s.body,
              why: s.why,
              iconHint: s.icon_hint,
            }))}
          />
        ) : null}
      </GuidanceCard>
    </div>
  );
};

export default WashDaySteps;
