import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Gold "Analyse this link" button. While `busy` is true it shows
 *  "Reading page…" with a dark-gold progress bar filling left → right
 *  behind the label as a visual guideline for the analysis duration.
 *  Eases toward 95% over ~14s and snaps to 100% when busy flips false. */
export function UrlScanProgressButton({
  busy,
  disabled,
  onClick,
  className,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  const [progress, setProgress] = useState(0);
  const startedAt = useRef<number | null>(null);
  const rafTimer = useRef<number | null>(null);

  useEffect(() => {
    if (busy) {
      startedAt.current = Date.now();
      setProgress(4);
      const tick = () => {
        const elapsed = (Date.now() - (startedAt.current ?? Date.now())) / 1000;
        // ease toward 95% over ~14s, then crawl
        const target = 95 * (1 - Math.exp(-elapsed / 5));
        setProgress((p) => (target > p ? target : p));
        rafTimer.current = window.setTimeout(tick, 120) as unknown as number;
      };
      tick();
      return () => {
        if (rafTimer.current) window.clearTimeout(rafTimer.current);
      };
    } else {
      if (rafTimer.current) window.clearTimeout(rafTimer.current);
      if (startedAt.current !== null) {
        // snap to 100 then reset
        setProgress(100);
        const t = window.setTimeout(() => {
          setProgress(0);
          startedAt.current = null;
        }, 350);
        return () => window.clearTimeout(t);
      }
    }
  }, [busy]);

  return (
    <Button
      variant="gold"
      size="pill"
      onClick={onClick}
      disabled={disabled}
      className={`relative overflow-hidden ${className ?? ""}`}
    >
      {busy && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-[hsl(38_70%_28%/0.55)] transition-[width] duration-150 ease-linear"
          style={{ width: `${progress}%` }}
        />
      )}
      <span className="relative z-10 flex items-center justify-center">
        {busy ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" /> Reading page…
          </>
        ) : (
          "Analyse this link"
        )}
      </span>
    </Button>
  );
}
