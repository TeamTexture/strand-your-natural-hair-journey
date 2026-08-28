import { Lightbulb } from "lucide-react";

export interface StrandTipNote {
  title: string;
  note: string;
}

/** Narrows an unknown payload field into the Strand Tip shape. */
export function parseStrandTips(value: unknown): StrandTipNote[] {
  if (!Array.isArray(value)) return [];
  const out: StrandTipNote[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const note = typeof row.note === "string" ? row.note.trim() : "";
    if (!title || !note) continue;
    out.push({ title, note });
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Mild, non-harmful observations. Deliberately rendered BELOW and OUTSIDE the
 * score callout: these are food for thought, never part of why the score is
 * what it is, and they never move the rating.
 */
export default function StrandTipNotes({ tips }: { tips: StrandTipNote[] }) {
  if (!tips.length) return null;
  return (
    <div className="mt-3 rounded-2xl border border-border/60 bg-secondary/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-primary" aria-hidden />
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
          {tips.length > 1 ? "Strand tips" : "Strand tip"}
        </p>
      </div>
      <p className="mb-2 font-body text-[11px] leading-snug text-muted-foreground">
        Worth knowing — this does not affect your rating.
      </p>
      <ul className="space-y-2">
        {tips.map((tip, i) => (
          <li key={`${tip.title}-${i}`} className="font-body text-[13px] leading-relaxed">
            <span className="font-semibold text-foreground">{tip.title}</span>
            <span className="text-foreground/75"> — {tip.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
