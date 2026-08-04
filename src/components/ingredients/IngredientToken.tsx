import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import IngredientExplainerSheet from "@/components/ingredients/IngredientExplainerSheet";
import { useIngredientGlossary } from "@/hooks/useIngredientGlossary";
import { bracketPhonetic, splitCompoundLabel } from "@/lib/ingredientLabel";


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
        "inline text-left font-medium text-foreground underline decoration-dotted decoration-primary/70 decoration-1 underline-offset-2 hover:decoration-primary transition",
        className,
      )}
    >
      {label ?? name}
    </button>
  );
}

/** The bracketed pronunciation shown beside a name in LIST items only. */
function InlinePhonetic({ phonetic }: { phonetic: string | null | undefined }) {
  const text = bracketPhonetic(phonetic);
  if (!text) return null;
  return (
    <span className="ml-1 text-[11px] font-normal text-foreground/50 font-body">{text}</span>
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
  const { tokenNames, lookup } = useIngredientGlossary();
  const parts = useMemo(() => {
    type Seg = { text: string; name?: string };
    const spans: { start: number; end: number; name: string }[] = [];
    const claimed = new Set<string>();
    for (const term of tokenNames) {
      const key = term.toLowerCase();
      if (claimed.has(key)) continue;
      const idx = text.toLowerCase().indexOf(key);
      if (idx < 0) continue;
      const before = text[idx - 1];
      const after = text[idx + term.length];
      if ((before && /[\w-]/.test(before)) || (after && /[\w-]/.test(after))) continue;
      if (spans.some((s) => !(idx + term.length <= s.start || idx >= s.end))) continue;
      const row = lookup(term);
      if (!row) continue;
      claimed.add(key);
      spans.push({ start: idx, end: idx + term.length, name: row.display_name });
    }
    spans.sort((a, b) => a.start - b.start);
    const segs: Seg[] = [];
    let cursor = 0;
    for (const s of spans) {
      if (s.start > cursor) segs.push({ text: text.slice(cursor, s.start) });
      segs.push({ text: text.slice(s.start, s.end), name: s.name });
      cursor = s.end;
    }
    if (cursor < text.length) segs.push({ text: text.slice(cursor) });
    return segs;
  }, [text, tokenNames, lookup]);

  if (!parts.some((p) => p.name)) {
    return <span className={cn("font-semibold text-foreground", className)}>{text}</span>;
  }
  return (
    <>
      {parts.map((p, i) =>
        p.name ? (
          <IngredientToken key={`gp-${i}`} name={p.name} label={p.text} className={className} />
        ) : (
          <span key={`gp-${i}`} className={cn("font-semibold text-foreground", className)}>
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
 * `showPhonetic` is for LIST items (flag rows, score reasons, INCI chips) where
 * there is room for a bracketed pronunciation. Flowing prose leaves it off and
 * reveals the phonetic on tap instead.
 */
export function GlossaryTerm({
  text,
  className,
  showPhonetic = false,
}: {
  text: string;
  className?: string;
  showPhonetic?: boolean;
}) {
  const { lookup } = useIngredientGlossary();
  const row = lookup(text);
  if (!row) return <GlossaryPhrase text={text} className={className} />;
  return (
    <>
      <IngredientToken name={row.display_name} label={text} className={className} />
      {showPhonetic && <InlinePhonetic phonetic={row.phonetic} />}
    </>
  );
}


/**
 * GlossaryLabel — renders a possibly-COMPOUND ingredient label. The label is
 * split on " and ", " & ", "/" and commas, each part is looked up in the shared
 * glossary independently, and only the parts that resolve become tappable. The
 * connecting words and any unresolved part stay plain text, so a descriptive
 * phrase ("mild surfactant concentration") never renders as a dead token.
 */
export function GlossaryLabel({
  label,
  className,
  showPhonetic = false,
}: {
  label: string;
  className?: string;
  showPhonetic?: boolean;
}) {
  const { lookup } = useIngredientGlossary();
  const parts = useMemo(() => splitCompoundLabel(label), [label]);
  const resolved = parts.map((p) => (p.candidate ? lookup(p.lookup) : null));
  if (!resolved.some(Boolean)) {
    return <span className={cn("font-semibold text-foreground", className)}>{label}</span>;
  }
  return (
    <>
      {parts.map((part, i) => {
        const row = resolved[i];
        if (!row) {
          return (
            <span key={`gl-${i}`} className={cn("font-semibold text-foreground", className)}>
              {part.text}
            </span>
          );
        }
        return (
          <React.Fragment key={`gl-${i}`}>
            <IngredientToken name={row.display_name} label={part.text.trim()} className={className} />
            {showPhonetic && <InlinePhonetic phonetic={row.phonetic} />}
          </React.Fragment>
        );
      })}
    </>
  );
}

export default IngredientToken;

