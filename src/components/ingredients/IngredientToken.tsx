import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import IngredientExplainerSheet from "@/components/ingredients/IngredientExplainerSheet";
import { useIngredientGlossary } from "@/hooks/useIngredientGlossary";
import { splitCompoundLabel } from "@/lib/ingredientLabel";
import { glossarySegments } from "@/lib/glossarySpans";


interface Ctx {
  /** Opens the explainer sheet for an ingredient name. */
  openIngredient: (name: string, userProductId?: string | null) => void;
  /** Product whose ingredient list the surrounding copy is about, if any. */
  productId: string | null;
}

const IngredientSheetContext = createContext<Ctx | null>(null);

/**
 * Mounts the single app-wide ingredient explainer sheet. Every ingredient name
 * rendered in AI copy, flag rows and INCI chips opens this one sheet, so the
 * cached three-layer payload is shared across surfaces.
 */
export function IngredientSheetProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const openIngredient = useCallback((n: string, pid?: string | null) => {
    setName(n);
    setProductId(pid ?? null);
    setOpen(true);
  }, []);

  const value = useMemo<Ctx>(() => ({ openIngredient, productId: null }), [openIngredient]);

  return (
    <IngredientSheetContext.Provider value={value}>
      {children}
      <IngredientExplainerSheet
        name={name}
        userProductId={productId}
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setName(null);
        }}
      />
    </IngredientSheetContext.Provider>
  );
}

/**
 * Scopes the ingredient tokens inside it to one product, so the sheet can
 * explain what the ingredient is doing in *that* formula.
 */
export function IngredientProductScope({
  productId,
  children,
}: {
  productId: string | null | undefined;
  children: React.ReactNode;
}) {
  const parent = useContext(IngredientSheetContext);
  const value = useMemo<Ctx>(
    () => ({
      openIngredient: (n, pid) => parent?.openIngredient(n, pid ?? productId ?? null),
      productId: productId ?? null,
    }),
    [parent, productId],
  );
  if (!parent) return <>{children}</>;
  return <IngredientSheetContext.Provider value={value}>{children}</IngredientSheetContext.Provider>;
}

export function useIngredientSheet() {
  return useContext(IngredientSheetContext);
}

/**
 * IngredientToken — a tappable ingredient name inside body copy. Styled as a
 * dotted-underline term rather than a link, because it opens an explainer in
 * place instead of navigating away.
 */
export function IngredientToken({
  name,
  label,
  className,
}: {
  name: string;
  label?: string;
  className?: string;
}) {
  const ctx = useIngredientSheet();
  if (!ctx) return <>{label ?? name}</>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        ctx.openIngredient(name, ctx.productId);
      }}
      className={cn(
        "glossary-token inline whitespace-normal text-left font-medium text-foreground underline decoration-dotted decoration-primary/70 decoration-1 underline-offset-2 hover:decoration-primary transition",
        className,
      )}
    >
      {label ?? name}
    </button>
  );
}


/**
 * GlossaryPhrase — tokenises glossary terms found INSIDE a longer phrase
 * ("cetearyl alcohol content", "porosity mismatch"), keeping the surrounding
 * words as plain (bold) text. Only the first occurrence of each term matches.
 */
export function GlossaryPhrase({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  // Uses the SAME matcher and the SAME (uncapped-concept) vocabulary as prose,
  // so "surfactant" inside "Strong clarifying surfactant system" and
  // "high-porosity" both resolve exactly as they do in body copy.
  const { proseTermNames, lookup } = useIngredientGlossary();
  const parts = useMemo(
    () => glossarySegments(text, proseTermNames, lookup),
    [text, proseTermNames, lookup],
  );

  if (!parts.some((p) => p.name)) {
    return <span className={cn("wrap-words font-semibold text-foreground", className)}>{text}</span>;
  }
  return (
    <>
      {parts.map((p, i) =>
        p.name ? (
          <IngredientToken key={`gp-${i}`} name={p.name} label={p.text} className={className} />
        ) : (
          <span key={`gp-${i}`} className={cn("wrap-words font-semibold text-foreground", className)}>
            {p.text}
          </span>
        ),
      )}
    </>
  );
}

/**
 * GlossaryTerm — tokenises a phrase only when it resolves in the shared
 * glossary, so trait names ("high porosity") stay plain text while real
 * ingredient names become tappable. When the whole phrase doesn't resolve, any
 * glossary term embedded inside it is still tokenised.
 *
 * Phonetics are deliberately shown only in the ingredient explainer sheet, not
 * inline, so list surfaces stay scannable.
 */
export function GlossaryTerm({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const { lookup } = useIngredientGlossary();
  const row = lookup(text);
  if (!row) return <GlossaryPhrase text={text} className={className} />;
  return <IngredientToken name={row.display_name} label={text} className={className} />;
}


/**
 * GlossaryLabel — renders a possibly-COMPOUND ingredient label. The label is
 * split on " and ", " & ", "/" and commas, each part is looked up in the shared
 * glossary independently, and only the parts that resolve become tappable. The
 * connecting words and any unresolved part stay plain text, so a descriptive
 * phrase ("mild surfactant concentration") never renders as a dead token.
 *
 * Phonetics are deliberately shown only in the ingredient explainer sheet, not
 * inline, so list surfaces stay scannable.
 */
export function GlossaryLabel({
  label,
  className,
  forceToken = false,
}: {
  label: string;
  className?: string;
  /**
   * Set on surfaces where the label IS a real ingredient name (an INCI list
   * row, an AI ingredient flag). The explainer sheet generates a definition —
   * including the phonetic spelling — on demand, so the name stays tappable
   * even when the shared glossary has not indexed it yet.
   */
  forceToken?: boolean;
}) {
  const { lookup } = useIngredientGlossary();
  const parts = useMemo(() => splitCompoundLabel(label), [label]);
  const resolved = parts.map((p) => (p.candidate ? lookup(p.lookup) : null));
  if (!resolved.some(Boolean)) {
    if (forceToken && label.trim().length >= 3) {
      return <IngredientToken name={label.trim()} label={label} className={className} />;
    }
    return <GlossaryPhrase text={label} className={className} />;
  }

  return (
    <>
      {parts.map((part, i) => {
        const row = resolved[i];
        if (!row) {
          return <GlossaryPhrase key={`gl-${i}`} text={part.text} className={className} />;
        }

        return (
          <IngredientToken key={`gl-${i}`} name={row.display_name} label={part.text.trim()} className={className} />
        );
      })}
    </>
  );
}

export default IngredientToken;

