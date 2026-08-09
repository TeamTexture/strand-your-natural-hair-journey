import { useEffect, useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import {
  PENDING_EVENT,
  listPendingStepProducts,
  pendingProgress,
  pendingSecondsLeft,
  removePendingStepProduct,
  type PendingStepProduct,
} from "@/lib/pendingStepProducts";

/**
 * Placeholder tiles for products still being analysed on this style record.
 * Shows a thumbnail slot, the source and a progress bar so the member can see
 * something is coming and roughly how long is left.
 */
const PendingStepProducts = ({
  entryId,
  onRetry,
}: {
  entryId: string;
  onRetry?: (p: PendingStepProduct) => void;
}) => {
  const [items, setItems] = useState<PendingStepProduct[]>(() => listPendingStepProducts(entryId));

  useEffect(() => {
    const sync = () => setItems(listPendingStepProducts(entryId));
    sync();
    window.addEventListener(PENDING_EVENT, sync);
    const t = window.setInterval(sync, 500);
    return () => {
      window.removeEventListener(PENDING_EVENT, sync);
      window.clearInterval(t);
    };
  }, [entryId]);

  if (!items.length) return null;

  return (
    <div className="space-y-2">
      {items.map((p) => {
        const pct = Math.round(pendingProgress(p) * 100);
        return (
          <div key={p.id} className="rounded-[12px] border border-border bg-card p-3">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-[8px] bg-secondary shrink-0 flex items-center justify-center">
                {p.failed ? (
                  <X className="size-4 text-muted-foreground" />
                ) : (
                  <Loader2 className="size-4 animate-spin text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {p.failed ? "Analysis didn't finish" : "Analysing new product"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {p.label} · Step {p.stepNumber}
                </p>
              </div>
              {p.failed ? (
                <div className="flex items-center gap-1 shrink-0">
                  {onRetry && (
                    <button
                      type="button"
                      onClick={() => { removePendingStepProduct(p.id); onRetry(p); }}
                      className="text-[10px] uppercase tracking-[0.14em] text-primary px-1"
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removePendingStepProduct(p.id)}
                    className="text-muted-foreground px-1"
                    aria-label="Dismiss"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-muted-foreground shrink-0">
                  ~{pendingSecondsLeft(p)}s
                </span>
              )}
            </div>
            {!p.failed && (
              <>
                <div className="mt-2.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground leading-snug">
                  You can leave this screen — it'll appear on Step {p.stepNumber} once it's analysed.
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PendingStepProducts;
