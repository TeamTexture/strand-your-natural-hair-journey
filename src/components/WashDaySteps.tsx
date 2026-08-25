// The user's personalised wash day sequence. Generated at runtime from the
// manuscript-grounded pipeline — never static copy, so there is no fallback
// text when generation fails.
//
// Presentation only: the card is collapsed on every visit and the amount of
// detail shown when open follows the member's support level (useTipsLevel, the
// single source of truth for tips_level).

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Droplets, Loader2, RefreshCw } from "lucide-react";
import TipsLevelPrompt from "@/components/TipsLevelPrompt";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { useWashDaySteps } from "@/hooks/useWashDaySteps";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { useSmartInline } from "@/lib/smartInline";
import { plainLanguage } from "@/components/beginner/BeginnerGuide";
import { dedupeSentences } from "@/lib/tipsRender";
import { guidanceIcon } from "@/lib/guidance";
import { cn } from "@/lib/utils";

/** "9 steps · starts with sectioning" */
const summaryLine = (count: number, first?: string) => {
  const steps = `${count} step${count === 1 ? "" : "s"}`;
  const title = (first ?? "").trim().replace(/[.!?]+$/, "");
  if (!title) return steps;
  const lower = title.charAt(0).toLowerCase() + title.slice(1);
  return `${steps} · starts with ${lower}`;
};

const WashDaySteps = ({ className }: { className?: string }) => {
  const { data, isLoading, isError, refetch, isFetching } = useWashDaySteps();
  const { level } = useTipsLevel();
  const render = useSmartInline();
  const [open, setOpen] = useState(false);
  const steps = data?.steps ?? [];
  const isStale = data?.stale === true;

  const showInstruction = level >= 3;
  const showWhy = level >= 3;

  // Her previous sequence is on screen because a fresh generation failed. Try
  // once more in the background so it catches up with her current profile.
  const retried = useRef(false);
  useEffect(() => {
    if (isStale && !retried.current && !isFetching) {
      retried.current = true;
      void refetch();
    }
  }, [isStale, isFetching, refetch]);

  const hasSteps = steps.length > 0;

  return (
    <div className={className}>
      <section className="rounded-[14px] border border-primary/25 bg-primary/[0.045] text-foreground p-4">
        <button
          type="button"
          onClick={() => hasSteps && setOpen((o) => !o)}
          aria-expanded={hasSteps ? open : undefined}
          disabled={!hasSteps}
          className="flex w-full items-start gap-2 text-left disabled:cursor-default"
        >
          <Droplets className="size-4 shrink-0 text-primary mt-[3px]" aria-hidden />
          <span className="flex-1 min-w-0">
            <span className="block font-display text-[15.5px] leading-snug break-words">
              Your wash day, step by step
            </span>
            {hasSteps && (
              <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <span className="truncate">
                  {summaryLine(steps.length, steps[0]?.headline)}
                </span>
                {isStale && (
                  <Loader2
                    className="size-3 shrink-0 animate-spin text-primary/70"
                    aria-label="Updating"
                  />
                )}
              </span>
            )}
          </span>
          {hasSteps && (
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-primary mt-[3px] transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          )}
        </button>

        {isLoading && (
          <div className="py-2 mt-3">
            <LoadingDot />
            <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
              Writing your steps for your hair…
            </p>
          </div>
        )}

        {isError && (
          <div className="mt-3">
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
        )}

        {hasSteps && open && (
          <>
            <div
              aria-hidden
              className="mt-3 h-px bg-gradient-to-r from-primary/45 via-primary/20 to-transparent"
            />
            <ol className="relative mt-3 space-y-3">
              <span
                aria-hidden
                className="absolute left-[11.5px] top-3 bottom-3 w-px"
                style={{ background: "rgba(196,154,60,0.3)" }}
              />
              {steps.map((s, i) => {
                const Icon = guidanceIcon(
                  s.icon_hint ? `${s.icon_hint} ${s.headline}` : s.headline,
                );
                const seen = new Set<string>();
                const title = dedupeSentences(plainLanguage(s.headline), seen);
                const detail = showInstruction
                  ? dedupeSentences(
                      plainLanguage(
                        s.product_ref
                          ? `${s.body} Use your ${s.product_ref}.`.replace(/\s+/g, " ")
                          : s.body,
                      ),
                      seen,
                    )
                  : "";
                const why = showWhy && s.why
                  ? dedupeSentences(plainLanguage(s.why), seen)
                  : "";
                return (
                  <li key={i} className="relative flex gap-3">
                    <span className="relative z-10 size-6 shrink-0 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0 pt-[2px]">
                      <div className="flex items-start gap-1.5">
                        <Icon
                          className="size-3.5 text-primary shrink-0 mt-[3px]"
                          aria-hidden
                        />
                        <p
                          className="flex-1 min-w-0 text-[14.5px] font-medium leading-snug break-words [overflow-wrap:anywhere]"
                          style={{ color: "#2C2416" }}
                        >
                          {showWhy ? render(title, `wds-${i}`) : title}
                        </p>
                      </div>
                      {detail && (
                        <p
                          className="mt-1 pl-5 text-[13px] break-words [overflow-wrap:anywhere]"
                          style={{ color: "#4A4433", lineHeight: 1.5 }}
                        >
                          {showWhy ? render(detail, `wds-detail-${i}`) : detail}
                        </p>
                      )}
                      {why && (
                        <p
                          className="mt-1.5 ml-5 pl-[9px] text-[12px] italic leading-snug text-muted-foreground break-words"
                          style={{ borderLeft: "2px solid rgba(196,154,60,0.45)" }}
                        >
                          Why: {render(why, `wds-why-${i}`)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {hasSteps && (
          <div className="mt-3 min-w-0 empty:hidden empty:mt-0">
            <TipsLevelPrompt />
          </div>
        )}
      </section>
    </div>
  );
};

export default WashDaySteps;
