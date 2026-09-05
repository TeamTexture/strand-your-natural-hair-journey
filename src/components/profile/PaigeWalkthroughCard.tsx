// "Book your free 1:1 with Paige" — an invitation on Home, never a gate.
//
// Shown only once the member has finished onboarding (hair characteristics
// saved). Tapping the CTA reveals Calendly's INLINE embed in place, so booking
// never leaves the app. "Not now" never removes the invitation: it COLLAPSES it
// to a small persistent row that expands back to the full card on tap. State
// lives in `alert_dismissals` so it survives reload and device changes:
//   `paige_walkthrough::v1`       → legacy dismissal, read as "collapsed"
//   `paige_walkthrough::collapsed` → collapsed row
//   `paige_walkthrough::booked`    → booking completed (stays as a small row)
import { useEffect, useRef, useState } from "react";
import { CalendarHeart, Check, ChevronRight } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { useAlertDismissals } from "@/hooks/useAlertDismissals";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";

const CALENDLY_URL =
  "https://calendly.com/paigelewinconsulting/1-1-strand-walkthrough-with-paige";
const CALENDLY_SCRIPT = "https://assets.calendly.com/assets/external/widget.js";

const ALERT_KEY = "paige_walkthrough";
const SIG_LEGACY = "v1";
const SIG_COLLAPSED = "collapsed";
const SIG_BOOKED = "booked";


/** Load Calendly's widget script once per document. */
const useCalendlyScript = (enabled: boolean) => {
  const [ready, setReady] = useState(
    () => typeof window !== "undefined" && !!(window as { Calendly?: unknown }).Calendly,
  );
  useEffect(() => {
    if (!enabled || ready) return;
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CALENDLY_SCRIPT}"]`,
    );
    const el = existing ?? document.createElement("script");
    const onLoad = () => setReady(true);
    el.addEventListener("load", onLoad);
    if (!existing) {
      el.src = CALENDLY_SCRIPT;
      el.async = true;
      document.body.appendChild(el);
    } else if ((window as { Calendly?: unknown }).Calendly) {
      setReady(true);
    }
    return () => el.removeEventListener("load", onLoad);
  }, [enabled, ready]);
  return ready;
};

const PaigeWalkthroughCard = () => {
  const { loaded, isDismissed, dismiss } = useAlertDismissals();
  const { data: onboarding } = useOnboardingStatus();
  const holderRef = useRef<HTMLDivElement | null>(null);

  const collapsedStored =
    isDismissed(ALERT_KEY, SIG_COLLAPSED) || isDismissed(ALERT_KEY, SIG_LEGACY);
  const booked = isDismissed(ALERT_KEY, SIG_BOOKED);

  // `null` = follow the stored state; a boolean = this session's override.
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const expanded = expandedOverride ?? !(collapsedStored || booked);
  const [showCalendly, setShowCalendly] = useState(false);
  const scriptReady = useCalendlyScript(showCalendly);

  // Mount the inline widget once the script and the container both exist.
  useEffect(() => {
    if (!showCalendly || !scriptReady || !holderRef.current) return;
    if (holderRef.current.childElementCount > 0) return;
    const calendly = (window as {
      Calendly?: { initInlineWidget: (o: Record<string, unknown>) => void };
    }).Calendly;
    calendly?.initInlineWidget({
      url: `${CALENDLY_URL}?hide_gdpr_banner=1&background_color=FDF8F2&text_color=2C2416&primary_color=C49A3C`,
      parentElement: holderRef.current,
    });
  }, [showCalendly, scriptReady]);

  // A completed booking collapses the card down to its small reference row.
  useEffect(() => {
    if (!showCalendly) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { event?: string } | null;
      if (typeof data?.event !== "string" || !data.event.startsWith("calendly.")) return;
      if (data.event === "calendly.event_scheduled") {
        void dismiss([
          { key: ALERT_KEY, signature: SIG_BOOKED },
          { key: ALERT_KEY, signature: SIG_COLLAPSED },
        ]);
        setShowCalendly(false);
        setExpandedOverride(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [showCalendly, dismiss]);

  // Never before the hair characteristics step.
  if (!loaded || !onboarding?.dataComplete) return null;

  const collapse = () => {
    setShowCalendly(false);
    setExpandedOverride(false);
    if (!collapsedStored) void dismiss([{ key: ALERT_KEY, signature: SIG_COLLAPSED }]);
  };

  if (!expanded) {
    return (
      <div className="px-5 pb-2">
        <button
          type="button"
          onClick={() => setExpandedOverride(true)}
          className="w-full flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-2.5 text-left transition-transform active:scale-[0.99]"
        >
          <span className="size-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            {booked ? (
              <Check className="size-4 text-primary" />
            ) : (
              <CalendarHeart className="size-4 text-primary" />
            )}
          </span>
          <span className="min-w-0 flex-1 font-body text-[12.5px] leading-snug text-foreground break-words">
            {booked
              ? "Your free 1:1 with Paige is booked"
              : "Book your free 1:1 with Paige"}
          </span>
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 pb-2 relative z-0 isolate">
      <SurfaceCard className="py-4 relative overflow-hidden">
        <div className="flex items-start gap-3">
          <span className="size-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <CalendarHeart className="size-5 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[16px] leading-tight text-foreground break-words">
              Book your free 1:1 with Paige
            </h2>
            <p className="mt-1 font-body text-[12px] leading-snug text-muted-foreground">
              A quick walkthrough of STRAND, one to one — no charge.
            </p>
          </div>
        </div>

        {!showCalendly ? (
          <>
            <button
              type="button"
              onClick={() => setShowCalendly(true)}
              className="mt-3.5 w-full h-11 rounded-pill bg-primary text-primary-foreground font-body text-[13px] font-semibold tracking-wide transition-transform active:scale-[0.99]"
            >
              Pick a time
            </button>
            <button
              type="button"
              onClick={collapse}
              className="mt-2 w-full h-9 rounded-pill border border-border font-body text-[12px] text-muted-foreground"
            >
              Not now
            </button>
          </>
        ) : (
          <div className="mt-3.5">
            <div
              ref={holderRef}
              style={{ height: 560 }}
              className="strand-calendly-holder relative z-0 w-full rounded-2xl overflow-hidden border border-border bg-background"
            />

            <button
              type="button"
              onClick={collapse}
              className="mt-2 w-full h-9 rounded-pill border border-border font-body text-[12px] text-muted-foreground"
            >
              Not now
            </button>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
};


export default PaigeWalkthroughCard;
