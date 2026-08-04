import { cn } from "@/lib/utils";
import { useSmartInline } from "@/lib/smartInline";
import { splitParagraphs } from "@/lib/paragraphs";

/**
 * ProseText — the light-weight paragraph renderer for AI copy that sits inside
 * a fixed shell (an explainer sheet block, a callout, a card field) where the
 * full GuidanceBody treatment (icon rows, segments, chips) would be wrong.
 *
 * It still enforces the two app-wide prose rules:
 *  - blank lines in the model's output become separate spaced paragraphs;
 *  - inline product / brand / ingredient / glossary terms become tappable,
 *    with only the FIRST occurrence of each term per paragraph tokenised.
 */
export default function ProseText({
  text,
  className,
  paragraphClassName,
  keyPrefix = "pt",
}: {
  text: string | null | undefined;
  className?: string;
  paragraphClassName?: string;
  keyPrefix?: string;
}) {
  const render = useSmartInline();
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return null;
  return (
    <div className={cn(paragraphs.length > 1 && "space-y-2", className)}>
      {paragraphs.map((block, i) => (
        <p key={i} className={cn("break-words", paragraphClassName)}>
          {render(block, `${keyPrefix}-${i}`)}
        </p>
      ))}
    </div>
  );
}
