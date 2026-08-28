import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { IngredientToken } from "@/components/ingredients/IngredientToken";
import { useIngredientGlossary } from "@/hooks/useIngredientGlossary";
import { glossarySegments } from "@/lib/glossarySpans";

/**
 * GlossaryRichText — the standing renderer for member-facing analysis prose.
 *
 * Every term that resolves in the shared glossary (molecule, ingredient family
 * or hair-science concept) renders BOLD and TAPPABLE, opening the same
 * explainer sheet ingredient names already open. Everything else renders as
 * plain body copy, so the emphasis actually means something.
 *
 * Closed vocabulary: a word is only emphasised when a glossary row exists for
 * it. No definitions are invented at render time.
 */
export default function GlossaryRichText({
  text,
  className,
  termClassName,
}: {
  text: string | null | undefined;
  className?: string;
  termClassName?: string;
}) {
  const { proseTermNames, lookup } = useIngredientGlossary();
  const segments = useMemo(
    () => glossarySegments(text ?? "", proseTermNames, lookup),
    [text, proseTermNames, lookup],
  );

  if (segments.length === 0) return null;
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.name ? (
          <IngredientToken
            key={`grt-${i}`}
            name={seg.name}
            label={seg.text}
            className={cn("font-semibold text-foreground", termClassName)}
          />
        ) : (
          <span key={`grt-${i}`}>{seg.text}</span>
        ),
      )}
    </span>
  );
}
