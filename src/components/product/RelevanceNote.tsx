import { Compass } from "lucide-react";
import GlossaryRichText from "@/components/ingredients/GlossaryRichText";

/** Narrows the stored/AI field into a clean sentence, or null. */
export function parseRelevanceNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= 12 ? text : null;
}

/**
 * TWO AXES (2026-09-01). The rating answers "is this well made and safe for
 * her?"; this row answers the separate question "is its purpose what she is
 * working on right now?". It is rendered as its own row UNDER the verdict and
 * never inside "Why it scored this high/low" — a purpose mismatch is not a
 * mark against the product and never moves the rating.
 */
export default function RelevanceNote({ note }: { note: string | null | undefined }) {
  const text = parseRelevanceNote(note);
  if (!text) return null;
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-[14px] border border-border/60 bg-secondary/30 px-3 py-2.5">
      <Compass className="mt-[2px] size-3.5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-body text-[10.5px] font-semibold uppercase tracking-[0.1em] text-foreground/50">
          What this is aimed at
        </p>
        <p className="wrap-words mt-1 font-body text-[12.5px] leading-[1.5] text-foreground/75">
          <GlossaryRichText text={text} />
        </p>
        <p className="mt-1 font-body text-[11px] leading-snug text-muted-foreground">
          This does not affect your rating.
        </p>
      </div>
    </div>
  );
}
