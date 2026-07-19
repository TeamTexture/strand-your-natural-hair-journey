import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export function ToolAdviceDialog({
  open,
  onOpenChange,
  payload,
  title,
  primaryLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payload: Record<string, unknown> | null;
  title: string;
  primaryLabel: string;
}) {
  if (!payload) return null;
  const rawScore = payload.match_score;
  const score =
    typeof rawScore === "number" ? Math.max(0, Math.min(100, Math.round(rawScore))) : null;
  const stars = score != null ? Math.max(1, Math.round(score / 20)) : null;
  const summary =
    typeof payload.ai_summary === "string"
      ? payload.ai_summary
      : typeof payload.summary === "string"
      ? (payload.summary as string)
      : "";
  const rationale =
    typeof payload.personalisation_rationale === "string"
      ? payload.personalisation_rationale
      : "";
  const howToUse =
    typeof payload.how_to_use === "string" ? payload.how_to_use : "";
  const features = asStringArray(payload.key_features);
  const tips = asStringArray(payload.tips);
  const useCases = asStringArray(payload.use_cases);
  const routineSuggestion =
    typeof payload.routine_suggestion === "string" ? payload.routine_suggestion : "";
  const pairWith = Array.isArray(payload.pair_with)
    ? (payload.pair_with as Array<Record<string, unknown>>)
        .map((p) => ({
          item: typeof p?.item === "string" ? p.item : "",
          why: typeof p?.why === "string" ? p.why : "",
        }))
        .filter((p) => p.item)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {title}
          </DialogTitle>
          {score != null && (
            <DialogDescription asChild>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-2xl font-heading text-primary">{score}</span>
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  / 100 hair-profile fit
                </span>
                {stars != null && (
                  <span className="ml-auto text-primary">
                    {"★".repeat(stars)}
                    <span className="text-muted-foreground/40">
                      {"★".repeat(5 - stars)}
                    </span>
                  </span>
                )}
              </div>
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {rationale && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Why for you
              </h4>
              <p className="leading-relaxed">{rationale}</p>
            </section>
          )}
          {howToUse && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                How to use
              </h4>
              <p className="leading-relaxed">{howToUse}</p>
            </section>
          )}
          {summary && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                What it is
              </h4>
              <p className="leading-relaxed">{summary}</p>
            </section>
          )}
          {features.length > 0 && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Key features
              </h4>
              <ul className="list-disc pl-4 space-y-1">
                {features.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </section>
          )}
          {tips.length > 0 && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Tips
              </h4>
              <ul className="list-disc pl-4 space-y-1">
                {tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          )}
          {useCases.length > 0 && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Best for
              </h4>
              <p className="leading-relaxed">{useCases.join(" · ")}</p>
            </section>
          )}
          {pairWith.length > 0 && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Pair with (from your shelf)
              </h4>
              <ul className="space-y-1.5">
                {pairWith.map((p, i) => (
                  <li key={i} className="leading-relaxed">
                    <span className="font-medium">{p.item}</span>
                    {p.why ? <span className="text-muted-foreground"> — {p.why}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {routineSuggestion && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Slot into your routine
              </h4>
              <p className="leading-relaxed">{routineSuggestion}</p>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="gold" size="pill" onClick={() => onOpenChange(false)}>
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ToolAdviceDialog;
