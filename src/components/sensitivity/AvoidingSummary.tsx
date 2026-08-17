import { ShieldAlert, ChevronRight } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { useSensitivities } from "@/hooks/useSensitivities";
import {
  SEVERITY_SHORT,
  type SensitivityScope,
} from "@/lib/sensitivityVocab";

/**
 * Persistent "avoiding" strip at the top of the products and nutrition pages.
 * Always visible, always tappable to edit — including when the member has said
 * they have none, and when they have never answered.
 */
const AvoidingSummary = ({
  scope,
  onEdit,
}: {
  scope: SensitivityScope;
  onEdit: () => void;
}) => {
  const { entriesFor, confirmedAt, loading } = useSensitivities();
  const entries = entriesFor(scope);
  const answered = confirmedAt(scope) !== null;

  if (loading) return null;

  const heading = scope === "dietary" ? "Food you're avoiding" : "Ingredients you're avoiding";

  return (
    <button
      type="button"
      onClick={onEdit}
      className="block w-full text-left"
      aria-label={`Edit ${heading.toLowerCase()}`}
    >
      <SurfaceCard tone={entries.length > 0 ? "orange" : "card"} padded className="p-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-body text-[11px] uppercase tracking-wide text-muted-foreground">
              {heading}
            </p>
            {entries.length === 0 ? (
              <p className="mt-0.5 font-body text-[12px] leading-relaxed text-muted-foreground">
                {answered
                  ? "You've told us there's nothing to avoid. Tap to change that any time."
                  : "Not set yet. Tap to tell STRAND what to keep out."}
              </p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {entries.map((e) => (
                  <span
                    key={`${e.code ?? "custom"}-${e.label}`}
                    className="rounded-pill border border-border bg-background px-2 py-0.5 font-body text-[11px] [overflow-wrap:anywhere]"
                  >
                    {e.label}
                    <span className="text-muted-foreground"> · {SEVERITY_SHORT[e.severity]}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
      </SurfaceCard>
    </button>
  );
};

export default AvoidingSummary;
