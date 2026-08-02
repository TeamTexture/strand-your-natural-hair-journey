import { Sparkles, Copy, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import AnchorStat from "@/components/guidance/AnchorStat";
import StatusCallout from "@/components/guidance/StatusCallout";
import ActionList from "@/components/guidance/ActionList";
import IngredientFlagRow from "@/components/product/IngredientFlagRow";
import { leadPhrase } from "@/lib/tipsRender";
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
        .map((p) => {
          const rawSource = typeof p?.source === "string" ? p.source.toLowerCase() : "";
          const source: "shelf" | "wishlist" | "suggested" =
            rawSource === "wishlist" ? "wishlist" : rawSource === "suggested" ? "suggested" : "shelf";
          return {
            item: typeof p?.item === "string" ? p.item : "",
            why: typeof p?.why === "string" ? p.why : "",
            source,
          };
        })
        .filter((p) => p.item)
    : [];
  const warnings = asStringArray(payload.warnings);

  const copyAndOpenAmazon = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      toast.success("Name copied — opening Amazon.co.uk");
    } catch {
      toast.message("Opening Amazon.co.uk", { description: name });
    }
    const q = encodeURIComponent(name);
    window.open(`https://www.amazon.co.uk/s?k=${q}`, "_blank", "noopener,noreferrer");
  };

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
              <div className="pt-1">
                <AnchorStat
                  value={score}
                  context="/ 100 hair-profile fit"
                  tone={score >= 70 ? "good" : score >= 40 ? "gold" : "warning"}
                />
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
          {summary && (() => {
            const { phrase, rest } = leadPhrase(summary);
            const vTone = score == null ? "insight" : score >= 70 ? "good" : score >= 40 ? "gold" : "warning";
            return (
              <StatusCallout tone={vTone} label="Verdict">
                <p>
                  {phrase && <span className="font-semibold text-foreground">{phrase} </span>}
                  <span className="text-foreground/75">{rest}</span>
                </p>
              </StatusCallout>
            );
          })()}
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
              <ActionList idPrefix="tool-tip" actions={tips.map((t) => ({ action: t }))} showWhy={false} />
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
          {warnings.length > 0 && (
            <section className="space-y-1.5">
              <h4 className="text-[11px] uppercase tracking-wider text-destructive mb-1 flex items-center gap-1.5">
                <AlertTriangle className="size-3" /> Be careful
              </h4>
              {warnings.map((w, i) => (
                <IngredientFlagRow key={i} name={w.split(/[:—-]/)[0].slice(0, 40)} reason={w} flag="bad" />
              ))}
            </section>
          )}
          {pairWith.length > 0 && (
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Pair with
              </h4>
              <ul className="space-y-2.5">
                {pairWith.map((p, i) => {
                  const badge =
                    p.source === "shelf"
                      ? { label: "On your shelf", cls: "bg-primary/15 text-primary" }
                      : p.source === "wishlist"
                      ? { label: "On your wishlist", cls: "bg-warn/20 text-warn" }
                      : { label: "Suggested", cls: "bg-muted text-muted-foreground" };
                  const showBuy = p.source === "wishlist" || p.source === "suggested";
                  return (
                    <li key={i} className="leading-relaxed">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{p.item}</span>
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      {p.why && (
                        <p className="text-muted-foreground text-xs mt-0.5">{p.why}</p>
                      )}
                      {showBuy && (
                        <div className="flex gap-2 mt-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(p.item).then(
                                () => toast.success("Name copied"),
                                () => toast.error("Couldn't copy"),
                              );
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                          >
                            <Copy className="size-3" /> Copy name
                          </button>
                          <button
                            type="button"
                            onClick={() => copyAndOpenAmazon(p.item)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                          >
                            <ExternalLink className="size-3" /> Buy on Amazon.co.uk
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
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
