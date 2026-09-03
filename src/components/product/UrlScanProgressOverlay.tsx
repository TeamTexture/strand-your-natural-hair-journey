// Live wait state for a pasted-link product scan. Mounted once in App, driven
// by the store in src/lib/urlScanProgress.ts, so every surface that can start a
// link scan gets the same honest progress without its own wiring.
//
// Timing is measured, not guessed: product-analyse-url over the last 7 days ran
// p50 56.7s, p90 71.5s (worst 94.2s). Stage copy follows the real pipeline —
// fetch the page, read the panel, match to her profile, verify every claim —
// and is replaced by real product details the moment they stream in.

import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import AiProgressBar from "@/components/AiProgressBar";
import {
  getUrlScanProgress,
  subscribeUrlScanProgress,
} from "@/lib/urlScanProgress";

const STAGES = [
  "Opening the product page",
  "Reading the ingredient panel",
  "Looking up the brand and product",
  "Matching to your hair profile",
  "Checking every claim before we show it",
  "Writing your write-up",
];

const UrlScanProgressOverlay = () => {
  const state = useSyncExternalStore(subscribeUrlScanProgress, getUrlScanProgress);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!state.active) return;
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [state.active]);

  if (!state.active) return null;

  const partial = state.partial;
  const name = partial?.product_name?.trim();
  const brand = partial?.brand?.trim();
  const count = partial?.ingredients?.length ?? 0;

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm px-4 pb-8">
      <div className="w-full rounded-3xl border border-border bg-card p-5 shadow-lg space-y-3">
        <div className="flex items-start gap-2">
          <Loader2 className="size-4 mt-0.5 shrink-0 animate-spin text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] leading-snug text-foreground break-words [overflow-wrap:anywhere]">
              {name || "Reading that link"}
            </p>
            {brand ? (
              <p className="font-body text-[12px] text-muted-foreground break-words [overflow-wrap:anywhere]">
                {brand}
              </p>
            ) : null}
          </div>
        </div>

        {count > 0 ? (
          <p className="font-body text-[12px] text-muted-foreground">
            {count} ingredient{count === 1 ? "" : "s"} read from the panel
          </p>
        ) : null}

        <AiProgressBar
          stages={STAGES}
          expectedMs={57000}
          overrunNote="Still working — this page is taking a little longer to read."
          compact
        />

        <p className="font-body text-[11px] leading-snug text-muted-foreground">
          Stay on this screen while it runs — leaving early interrupts the
          analysis.
        </p>
      </div>
    </div>
  );
};

export default UrlScanProgressOverlay;
