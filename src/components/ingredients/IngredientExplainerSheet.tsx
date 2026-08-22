import { Link } from "react-router-dom";
import { Beaker, CheckCircle2, AlertTriangle, XCircle, Sparkles, FlaskConical } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ProductThumb from "@/components/ProductThumb";
import { cn } from "@/lib/utils";
import { useIngredientExplainer } from "@/hooks/useIngredientExplainer";
import { useIngredientGlossary } from "@/hooks/useIngredientGlossary";
import { matchScoreOf } from "@/lib/matchStars";
import ProseText from "@/components/guidance/ProseText";

const VERDICT = {
  good: { label: "Works with your hair", icon: CheckCircle2, cls: "bg-good/12 border-good/30" },
  warn: { label: "Worth watching", icon: AlertTriangle, cls: "bg-warn/12 border-warn/30" },
  bad: { label: "Handle with care", icon: XCircle, cls: "bg-destructive/10 border-destructive/25" },
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
  // The shared glossary row is already cached client-side, so the name,
  // pronunciation and definition paint immediately — only the personalised
  // block below waits on generation.
  const { lookup } = useIngredientGlossary();
  const cached = name ? lookup(name) : null;
  const head = {
    display_name: explainer?.glossary?.display_name ?? cached?.display_name ?? name ?? "Ingredient",
    phonetic: explainer?.glossary?.phonetic ?? cached?.phonetic ?? null,
    what_it_is: explainer?.glossary?.what_it_is ?? cached?.what_it_is ?? null,
    kind: explainer?.glossary?.kind ?? cached?.kind ?? "molecule",
    category: explainer?.glossary?.category ?? cached?.category ?? null,
  };
  const verdict = explainer?.fit?.tone ? VERDICT[explainer.fit.tone] : null;
  const VerdictIcon = verdict?.icon ?? Beaker;
  const others = shelf.filter((p) => p.id !== userProductId);
  // A molecule is labelled by its cosmetic-chemistry category; a class or a
  // concept is labelled by what kind of term it is.
  const kind = head.kind;
  const kindLabel =
    kind === "concept"
      ? "Hair science"
      : kind === "class"
      ? "Ingredient family"
      : head.category ?? "";
  const glossaryId = (explainer?.glossary as { id?: string } | undefined)?.id ?? cached?.id ?? null;
  const shelfLabel = kind === "class" ? "On your shelf" : "Also on your shelf";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-[20px] px-4 pb-8">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-[20px] leading-tight">
            {head.display_name}
          </SheetTitle>
          {/* Pronunciation gets its own line directly beneath the name — it is
              how you say the word, not a category, so it is never concatenated
              with one. The category pill sits below it. */}
          {head.phonetic && (
            <p className="text-[12px] italic leading-snug text-muted-foreground font-body">
              {head.phonetic}
            </p>
          )}
          {kindLabel && (
            <span className="mt-1 inline-flex w-fit items-center rounded-pill border border-border bg-muted px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/60 font-body">
              {kindLabel}
            </span>
          )}

        </SheetHeader>

        {isLoading && (
          <div className="mt-4 space-y-2.5" aria-busy>
            {head.what_it_is && (
              <Block label="What it is" icon={FlaskConical}>
                <ProseText
                  text={head.what_it_is}
                  keyPrefix="ing-what-cached"
                  paragraphClassName="text-[13px] leading-relaxed text-foreground/85 font-body"
                />
              </Block>
            )}
            <div className="rounded-[12px] border border-border bg-muted/40 p-3">
              <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50 font-body">
                <Sparkles className="size-3.5 animate-pulse" aria-hidden />
                What it means for you
              </p>
              <div className="mt-2 space-y-1.5">
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>
        )}

        {!isLoading && error && head.what_it_is && (
          <div className="mt-4">
            <Block label="What it is" icon={FlaskConical}>
              <ProseText
                text={head.what_it_is}
                keyPrefix="ing-what-fallback"
                paragraphClassName="text-[13px] leading-relaxed text-foreground/85 font-body"
              />
            </Block>
          </div>
        )}

        {!isLoading && error && (
          <p className="mt-4 text-[13px] leading-relaxed text-foreground/70 font-body">
            We couldn't load this ingredient just now. Close this and tap it again in a moment.
          </p>
        )}

        {!isLoading && !error && explainer && (
          <div className="mt-4 space-y-2.5">
            {head.what_it_is && (
              <Block label="What it is" icon={FlaskConical}>
                <ProseText
                  text={head.what_it_is}
                  keyPrefix="ing-what"
                  paragraphClassName="text-[13px] leading-relaxed text-foreground/85 font-body"
                />
              </Block>
            )}
            {explainer.role_in_product && (
              <Block label="What it's doing here" icon={Beaker}>
                <ProseText
                  text={explainer.role_in_product}
                  keyPrefix="ing-role"
                  paragraphClassName="text-[13px] leading-relaxed text-foreground/85 font-body"
                />
              </Block>
            )}

            {explainer.fit?.for_you && (
              <div className={cn("rounded-[12px] border p-3", verdict?.cls ?? "bg-muted border-border")}>
                <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/60 font-body">
                  <VerdictIcon className="size-3.5" aria-hidden />
                  {verdict?.label ?? "What it means for you"}
                </p>
                <ProseText
                  text={explainer.fit.for_you}
                  className="mt-1.5"
                  keyPrefix="ing-fit"
                  paragraphClassName="text-[13px] leading-relaxed text-foreground/85 font-body"
                />
                {explainer.fit.usage_tip && (
                  <p className="mt-2 flex gap-1.5 text-[12px] leading-relaxed text-foreground/75 font-body">
                    <Sparkles className="mt-[3px] size-3 shrink-0 opacity-70" aria-hidden />
                    <span>{explainer.fit.usage_tip}</span>
                  </p>
                )}
              </div>
            )}

            {others.length > 0 && (
              <div className="rounded-[12px] border border-border bg-card p-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50 font-body">
                  {shelfLabel}
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

        {glossaryId && (
          <div className="mt-3 space-y-2">
            <BrandTagControl taggableType="glossary_term" taggableId={glossaryId} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
