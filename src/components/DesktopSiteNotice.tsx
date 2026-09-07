import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ZOOM_ATTR, watchViewportZoom } from "@/lib/viewportZoom";

const DISMISS_KEY = "strand_desktop_site_notice_dismissed";

/**
 * Shown only when the browser is laying the page out at desktop width on a
 * touch device (Chrome / Samsung Internet "Desktop site"). Scales itself up by
 * the inverse of the measured visual-viewport scale so it is readable while the
 * rest of the page is shrunk.
 */
const DesktopSiteNotice = () => {
  const [zoomedOut, setZoomedOut] = useState(
    () => typeof document !== "undefined" && document.documentElement.hasAttribute(ZOOM_ATTR),
  );
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => watchViewportZoom(setZoomedOut), []);

  if (!zoomedOut || dismissed) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="STRAND is showing at desktop size"
      className="absolute inset-0 z-[100] bg-background overflow-y-auto"
    >
      <div
        className="min-h-full flex flex-col justify-center gap-5 px-6 py-10"
        style={{
          zoom: "calc(1 / var(--strand-vv-scale, 1))",
          fontSize: "18px",
        }}
      >
        <h1 className="font-display text-primary text-[28px] leading-tight">
          STRAND is showing at desktop size
        </h1>
        <p className="font-body text-foreground text-[18px] leading-snug">
          Your browser is set to show the desktop version of websites. Turn off Desktop site, then
          tap Reload.
        </p>
        <ul className="font-body text-foreground/80 text-[16px] leading-snug space-y-2">
          <li>Chrome: tap the three dots at the top right, then untick Desktop site.</li>
          <li>
            Samsung Internet: tap the three lines at the bottom right, then tap Desktop site to turn
            it off.
          </li>
        </ul>
        <Button
          className="w-full rounded-pill text-[18px] py-6"
          onClick={() => window.location.reload()}
        >
          RELOAD
        </Button>
        <button
          type="button"
          className="font-body text-[16px] underline text-foreground/70 mx-auto"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* private mode */
            }
            setDismissed(true);
          }}
        >
          Continue anyway
        </button>
      </div>
    </div>
  );
};

export default DesktopSiteNotice;
