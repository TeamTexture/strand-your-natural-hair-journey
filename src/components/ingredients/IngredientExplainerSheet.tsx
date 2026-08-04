import { Link } from "react-router-dom";
import { Beaker, CheckCircle2, AlertTriangle, XCircle, Sparkles, FlaskConical } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ProductThumb from "@/components/ProductThumb";
import { cn } from "@/lib/utils";
import { useIngredientExplainer } from "@/hooks/useIngredientExplainer";
import { matchScoreOf } from "@/lib/matchStars";

const VERDICT = {
  suits: { label: "Suits your hair", icon: CheckCircle2, cls: "bg-good/12 border-good/30 text-good" },
  watch: { label: "Worth watching", icon: AlertTriangle, cls: "bg-warn/12 border-warn/30 text-warn" },
  avoid: { label: "Handle with care", icon: XCircle, cls: "bg-destructive/10 border-destructive/25 text-destructive" },
  neutral: { label: "Neutral for you", icon: Beaker, cls: "bg-muted border-border text-foreground/70" },
} as const;

const Block = ({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof Beaker;
  children: React.ReactNode;
}) => (
  <div className="rounded-[12px] border border-border bg-card p-3">
    <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50 font-body">
      <Icon className="size-3.5" aria-hidden />
      {label}
    </p>
    <div className="mt-1.5 text-[13px] leading-relaxed text-foreground/85 font-body">{children}</div>
  </div>
);

/**
 * IngredientExplainerSheet — the tappable explainer behind every ingredient
 * name in the app. Four blocks: what it is, what it does in this product, what
 * it means for this user, and where else it sits on their shelf.
 */
export default function IngredientExplainerSheet({
  name,
  userProductId,
  open,
  onOpenChange,
}: {
  name: string | null;
  userProductId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { explainer, isLoading, error, shelf } = useIngredientExplainer(open ? name : null, userProductId);
  const verdict = explainer?.fit?.verdict ? VERDICT[explainer.fit.verdict] : null;
  const VerdictIcon = verdict?.icon ?? Beaker;
  const others = shelf.filter((p) => p.id !== userProductId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-[20px] px-4 pb-8">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-[20px] leading-tight">
            {explainer?.display_name ?? name ?? "Ingredient"}
          </SheetTitle>
          {explainer?.glossary?.family && (
            <p className="text-[11.5px] uppercase tracking-[0.08em] text-foreground/50 font-body">
              {explainer.glossary.family}
            </p>
          )}
        </SheetHeader>

        {isLoading && (
          <div className="mt-4 space-y-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-[12px] bg-muted" />
            ))}
          </div>
        )}

        {!isLoading && error && (
          <p className="mt-4 text-[13px] leading-relaxed text-foreground/70 font-body">
            We couldn't load this ingredient just now. Close this and tap it again in a moment.
          </p>
        )}

        {!isLoading && !error && explainer && (
          <div className="mt-4 space-y-2.5">
            {explainer.glossary?.what_it_is && (
              <Block label="What it is" icon={FlaskConical}>
                {explainer.glossary.what_it_is}
              </Block>
            )}
            {(explainer.role_in_product || explainer.glossary?.what_it_does) && (
              <Block label={explainer.role_in_product ? "What it's doing here" : "What it does"} icon={Beaker}>
                {explainer.role_in_product || explainer.glossary?.what_it_does}
              </Block>
            )}

            {explainer.fit?.body && (
              <div className={cn("rounded-[12px] border p-3", verdict?.cls ?? "bg-muted border-border")}>
                <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] font-body">
                  <VerdictIcon className="size-3.5" aria-hidden />
                  {verdict?.label ?? "What it means for you"}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/85 font-body">
                  {explainer.fit.body}
                </p>
                {explainer.fit.signals && explainer.fit.signals.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {explainer.fit.signals.map((s, i) => (
                      <li key={i} className="flex gap-1.5 text-[12px] leading-relaxed text-foreground/75 font-body">
                        <Sparkles className="mt-[3px] size-3 shrink-0 opacity-70" aria-hidden />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {others.length > 0 && (
              <div className="rounded-[12px] border border-border bg-card p-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50 font-body">
                  Also on your shelf
                </p>
                <ul className="mt-2 space-y-1.5">
                  {others.slice(0, 8).map((p) => {
                    const score = matchScoreOf(p as never);
                    return (
                      <li key={p.id}>
                        <Link
                          to={`/products/profile/${p.id}`}
                          onClick={() => onOpenChange(false)}
                          className="flex items-center gap-2.5 rounded-[10px] border border-border/70 bg-background p-2 active:scale-[0.99] transition"
                        >
                          <ProductThumb
                            imageUrl={p.image_url}
                            storagePath={p.storage_path}
                            brand={p.brand ?? undefined}
                            name={p.name}
                            wrapperClassName="size-9 shrink-0"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-semibold text-foreground font-body">
                              {p.name}
                            </span>
                            {p.brand && (
                              <span className="block truncate text-[11px] text-foreground/55 font-body">{p.brand}</span>
                            )}
                          </span>
                          {typeof score === "number" && (
                            <span className="shrink-0 text-[12px] font-semibold text-foreground/70 font-body">
                              {score}%
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
