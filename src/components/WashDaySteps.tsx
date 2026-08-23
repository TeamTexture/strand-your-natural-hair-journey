// The user's personalised wash day sequence. Generated at runtime from the
// manuscript-grounded pipeline — never static copy, so there is no fallback
// text when generation fails.

import { useEffect, useRef } from "react";
import { Droplets, RefreshCw } from "lucide-react";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import StepSequence from "@/components/guidance/StepSequence";
import TipsLevelPrompt from "@/components/TipsLevelPrompt";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { useWashDaySteps } from "@/hooks/useWashDaySteps";

const WashDaySteps = ({ className }: { className?: string }) => {
  const { data, isLoading, isError, refetch, isFetching } = useWashDaySteps();
  const steps = data?.steps ?? [];
  const isStale = data?.stale === true;

  // Her previous sequence is on screen because a fresh generation failed. Try
  // once more in the background so it catches up with her current profile.
  const retried = useRef(false);
  useEffect(() => {
    if (isStale && !retried.current && !isFetching) {
      retried.current = true;
      void refetch();
    }
  }, [isStale, isFetching, refetch]);

  return (
    <div className={className}>
      <GuidanceCard
        eyebrow="Your wash day, step by step"
        icon={Droplets}
        tone="gold"
        footer={steps.length > 0 ? <TipsLevelPrompt /> : undefined}
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
        ) : steps.length > 0 ? (
          <>
            {isStale && (
              <p className="mb-2 text-[11px] text-muted-foreground">
                Updating for your latest profile…
              </p>
            )}
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
          </>
        ) : null}

      </GuidanceCard>
    </div>
  );
};

export default WashDaySteps;
