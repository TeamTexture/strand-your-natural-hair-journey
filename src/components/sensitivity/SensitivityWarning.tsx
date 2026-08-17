import { AlertTriangle } from "lucide-react";
import { useSensitivities } from "@/hooks/useSensitivities";
import { scanSensitivities } from "@/lib/sensitivityMatch";
import { SEVERITY_SHORT } from "@/lib/sensitivityVocab";

/**
 * Deterministic topical warning. Matched in the browser against the member's
 * own decrypted list — never a claim that a product is safe, only that
 * something they flagged appears in the declared list.
 */
const SensitivityWarning = ({
  ingredients,
}: {
  ingredients: string[] | null | undefined;
}) => {
  const { entriesFor } = useSensitivities();
  const entries = entriesFor("topical");
  const hits = scanSensitivities(ingredients, entries, "topical");
  if (hits.length === 0) return null;

  const hard = hits.some((h) => h.entry.severity === "avoid");

  return (
    <div
      className={`rounded-[14px] border p-3 ${
        hard ? "border-destructive/35 bg-destructive/[0.07]" : "border-warn/30 bg-warn/10"
      }`}
      role="note"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={`mt-0.5 size-4 shrink-0 ${hard ? "text-destructive" : "text-warn"}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="font-body text-[12px] font-semibold leading-snug">
            {hard
              ? "Contains something you avoid completely"
              : "Contains something you asked to watch"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {hits.map((h) => (
              <span
                key={`${h.entry.label}-${h.term}`}
                className="rounded-pill border border-border bg-background px-2 py-0.5 font-body text-[11px] [overflow-wrap:anywhere]"
              >
                {h.entry.label}
                <span className="text-muted-foreground"> · {h.term}</span>
                <span className="text-muted-foreground"> · {SEVERITY_SHORT[h.entry.severity]}</span>
              </span>
            ))}
          </div>
          <p className="mt-1.5 font-body text-[11px] leading-relaxed text-muted-foreground">
            Based on the ingredient list recorded here. Always read the pack — formulas change,
            and STRAND cannot check a label for you.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SensitivityWarning;
