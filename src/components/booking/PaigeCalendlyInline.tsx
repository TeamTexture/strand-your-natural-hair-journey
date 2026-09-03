// Shared inline Calendly embed for Paige's free 1:1 walkthrough.
//
// Extracted from PaigeWalkthroughCard so the retention offer dialog can offer
// the exact same booking experience without a redirect. The holder keeps the
// iframe contained (see `.strand-calendly-holder` in src/index.css) so it can
// never overflow the card or dialog it sits in.
import { useEffect, useRef, useState } from "react";

export const CALENDLY_URL =
  "https://calendly.com/paigelewinconsulting/1-1-strand-walkthrough-with-paige";
const CALENDLY_SCRIPT = "https://assets.calendly.com/assets/external/widget.js";

/** Load Calendly's widget script once per document. */
export const useCalendlyScript = (enabled: boolean) => {
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

/** Fires once Calendly reports a completed booking. */
export const useCalendlyScheduled = (active: boolean, onScheduled: () => void) => {
  useEffect(() => {
    if (!active) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { event?: string } | null;
      if (typeof data?.event !== "string" || !data.event.startsWith("calendly.")) return;
      if (data.event === "calendly.event_scheduled") onScheduled();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [active, onScheduled]);
};

const PaigeCalendlyInline = ({ height = 560 }: { height?: number }) => {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const scriptReady = useCalendlyScript(true);

  useEffect(() => {
    if (!scriptReady || !holderRef.current) return;
    if (holderRef.current.childElementCount > 0) return;
    const calendly = (window as {
      Calendly?: { initInlineWidget: (o: Record<string, unknown>) => void };
    }).Calendly;
    calendly?.initInlineWidget({
      url: `${CALENDLY_URL}?hide_gdpr_banner=1&background_color=FDF8F2&text_color=2C2416&primary_color=C49A3C`,
      parentElement: holderRef.current,
    });
  }, [scriptReady]);

  return (
    <div
      ref={holderRef}
      style={{ height }}
      className="strand-calendly-holder relative z-0 w-full rounded-2xl overflow-hidden border border-border bg-background"
    />
  );
};

export default PaigeCalendlyInline;
