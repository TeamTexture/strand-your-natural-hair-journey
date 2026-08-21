// Passive, non-AI shelf allergen alert.
//
// Reads the member's already-decrypted topical sensitivities (useSensitivities,
// backed by data-decrypt-context) and scans a saved product's stored INCI array
// with the same deterministic alias matcher the edge functions use
// (src/lib/sensitivityVocab.ts ⇄ _shared/allergen-aliases.ts).
//
// No model call, no network call, no latency. Re-evaluates automatically the
// moment a sensitivity is saved, because the sensitivities query is invalidated.

import { AlertTriangle } from "lucide-react";
import { useSensitivities } from "@/hooks/useSensitivities";
import { scanSensitivities } from "@/lib/sensitivityMatch";
import { cn } from "@/lib/utils";

export function useTopicalAlert(ingredients: string[] | null | undefined) {
  const { entriesFor } = useSensitivities();
  const hits = scanSensitivities(ingredients, entriesFor("topical"), "topical", {
    severities: ["avoid"],
  });
  return hits;
}

interface Props {
  ingredients: string[] | null | undefined;
  className?: string;
}

/** Full-width red strip across the product card. Renders nothing when clear. */
const SensitivityShelfAlert = ({ ingredients, className }: Props) => {
  const hits = useTopicalAlert(ingredients);
  if (hits.length === 0) return null;
  const labels = hits.map((h) => h.entry.label).join(", ");
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-1.5 bg-destructive px-3 py-1.5 text-destructive-foreground",
        className,
      )}
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] shrink-0">
        Sensitivity
      </span>
      <span className="font-body text-[11px] truncate">Contains {labels}</span>
    </div>
  );
};

/** Compact corner badge for pinning over a thumbnail. */
export const SensitivityThumbBadge = ({ ingredients }: Props) => {
  const hits = useTopicalAlert(ingredients);
  if (hits.length === 0) return null;
  return (
    <span
      aria-label="Contains an ingredient you avoid"
      className="inline-flex items-center gap-1 rounded-pill bg-destructive px-2 py-[3px] text-[9px] font-body font-semibold uppercase tracking-[0.12em] text-destructive-foreground shadow-sm"
    >
      <AlertTriangle className="size-2.5" /> Avoid
    </span>
  );
};

export default SensitivityShelfAlert;
