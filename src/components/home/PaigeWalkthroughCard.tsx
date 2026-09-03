// "Book your free 1:1 with Paige" — an invitation on Home, never a gate.
//
// Shown only once the member has finished onboarding (hair characteristics
// saved). Tapping the CTA reveals Calendly's INLINE embed in place, so booking
// never leaves the app. Dismissal and booking are both remembered in
// `alert_dismissals` (key `paige_walkthrough`), so it survives reload and
// device changes and is never shown again.
import { useEffect, useRef, useState } from "react";
import { CalendarHeart, X } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { useAlertDismissals } from "@/hooks/useAlertDismissals";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";

const CALENDLY_URL =
  "https://calendly.com/paigelewinconsulting/1-1-strand-walkthrough-with-paige";
const CALENDLY_SCRIPT = "https://assets.calendly.com/assets/external/widget.js";

const ALERT_KEY = "paige_walkthrough";
const ALERT_SIGNATURE = "v1";

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
  const [open, setOpen] = useState(false);
  const holderRef = useRef<HTMLDivElement | null>(null);
  const scriptReady = useCalendlyScript(open);

  // Mount the inline widget once the script and the container both exist.
  useEffect(() => {
    if (!open || !scriptReady || !holderRef.current) return;
    if (holderRef.current.childElementCount > 0) return;
    const calendly = (window as {
      Calendly?: { initInlineWidget: (o: Record<string, unknown>) => void };
    }).Calendly;
    calendly?.initInlineWidget({
      url: `${CALENDLY_URL}?hide_gdpr_banner=1&background_color=FDF8F2&text_color=2C2416&primary_color=C49A3C`,
      parentElement: holderRef.current,
    });
  }, [open, scriptReady]);

  // A completed booking is the strongest "don't show me again" signal there is.
  useEffect(() => {
    if (!open) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { event?: string } | null;
      if (typeof data?.event !== "string" || !data.event.startsWith("calendly.")) return;
      if (data.event === "calendly.event_scheduled") {
        void dismiss([{ key: ALERT_KEY, signature: ALERT_SIGNATURE }]);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, dismiss]);

  // Never before the hair characteristics step, never once answered.
  if (!loaded || !onboarding?.dataComplete) return null;
  if (isDismissed(ALERT_KEY, ALERT_SIGNATURE)) return null;

  return (
    <div className="px-5 pb-2">
      <SurfaceCard className="py-4 relative">
        <button
          type="button"
          onClick={() => void dismiss([{ key: ALERT_KEY, signature: ALERT_SIGNATURE }])}
          aria-label="Dismiss the 1:1 invitation"
          className="absolute top-2.5 right-2.5 size-7 rounded-full text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-start gap-3 pr-7">
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

        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3.5 w-full h-11 rounded-pill bg-primary text-primary-foreground font-body text-[13px] font-semibold tracking-wide transition-transform active:scale-[0.99]"
          >
            Pick a time
          </button>
        ) : (
          <div className="mt-3.5">
            <div
              ref={holderRef}
              className="w-full min-h-[620px] rounded-2xl overflow-hidden border border-border bg-background"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
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
