import { Sparkles, Loader2 } from "lucide-react";

interface Props {
  text?: string | null;
  loading?: boolean;
  className?: string;
}

/** The personalised hook on an advert: one line naming something real about
 *  this member's hair and what the product does for it. Renders nothing when
 *  there is no grounded line to show. */
/** A guidance line only counts as real copy when it has actual words in it.
 *  A degenerate model response (an empty string, a lone ".", whitespace) must be
 *  treated exactly like null so the caller falls through to its deterministic
 *  fallback instead of rendering a stub. */
export function hasFitContent(text?: string | null): boolean {
  if (!text) return false;
  const letters = text.replace(/[^\p{L}\p{N}]/gu, "");
  return letters.length >= 4;
}

/** Returns the line when it is real copy, otherwise `undefined`. */
export function validFitLine(text?: string | null): string | undefined {
  return hasFitContent(text) ? (text as string) : undefined;
}

const AdFitLine = ({ text: rawText, loading, className }: Props) => {
  const text = validFitLine(rawText);
  if (!text && !loading) return null;
  return (
    <p
      className={`flex items-start gap-1.5 text-[13px] leading-relaxed font-body font-medium text-foreground ${className ?? ""}`}
    >
      {loading && !text ? (
        <>
          <Loader2 className="size-3.5 mt-[3px] shrink-0 animate-spin text-primary" />
          <span className="text-muted-foreground font-normal">Reading this against your hair…</span>
        </>
      ) : (
        <>
          <Sparkles className="size-3.5 mt-[3px] shrink-0 text-primary" />
          <span>{text}</span>
        </>
      )}
    </p>
  );
};

export default AdFitLine;
