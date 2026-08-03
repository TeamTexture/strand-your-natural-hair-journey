import {
  createContext,
  useContext,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * PLAIN TERMS — one definition, once per page.
 *
 * Technical words (porosity, sebum, cuticle…) are explained in a single small
 * "In plain terms" footnote row underneath the first guidance block that uses
 * the word. Definitions are NEVER appended inline to prose, and never appear
 * twice on the same screen: the first block to claim a term owns it, and the
 * claim registry is reset on every route change.
 * ------------------------------------------------------------------ */

export interface PlainTerm {
  term: string;
  /** Explanation used when the term appears without a qualifier. */
  general: string;
  /** Explanations keyed by the qualifier in front of the term. */
  byQualifier?: Record<string, string>;
}

export const PLAIN_TERMS: PlainTerm[] = [
  {
    term: "porosity",
    general: "Porosity is how easily your hair takes water in and holds on to it.",
    byQualifier: {
      high: "High porosity means your hair drinks water in fast and loses it just as fast, so sealing matters more than adding more water.",
      low: "Low porosity means water sits on the surface at first, so warmth and time are what get it inside the strand.",
      medium: "Medium porosity means your hair takes water in steadily and holds it reasonably well.",
    },
  },
  {
    term: "surfactants",
    general: "Surfactants are the cleaning agents in shampoo that lift oil off your scalp.",
  },
  {
    term: "surfactant",
    general: "A surfactant is the cleaning agent in shampoo that lifts oil off your scalp.",
  },
  {
    term: "elasticity",
    general: "Elasticity is how far your hair stretches and springs back before it snaps.",
  },
  {
    term: "sebum",
    general: "Sebum is the natural oil your scalp makes.",
  },
  {
    term: "cuticles",
    general: "The cuticles are the tiny scales on the outside of each strand.",
  },
  {
    term: "cuticle",
    general: "The cuticle is the outer layer of each strand.",
  },
  {
    term: "density",
    general: "Density is how many strands you have on your head.",
  },
  {
    term: "humectants",
    general: "Humectants are ingredients that pull water towards your hair.",
  },
  {
    term: "emollients",
    general: "Emollients are the softening ingredients that smooth each strand.",
  },
];

const QUALIFIERS = ["high", "low", "medium", "fine", "coarse"];

export interface PlainTermHit {
  term: string;
  sentence: string;
}

/** Every technical term present in `text`, with the sentence that explains it. */
export function collectPlainTerms(text: string | null | undefined): PlainTermHit[] {
  if (!text) return [];
  const hits: PlainTermHit[] = [];
  for (const entry of PLAIN_TERMS) {
    const re = new RegExp(
      `(?:(${QUALIFIERS.join("|")})[\\s-])?\\b${entry.term}\\b(?![\\w-])`,
      "i",
    );
    const m = text.match(re);
    if (!m) continue;
    const qualifier = m[1]?.toLowerCase();
    const sentence = (qualifier && entry.byQualifier?.[qualifier]) || entry.general;
    // Already explained in the copy itself — no footnote needed.
    const marker = sentence.split(" ").slice(0, 4).join(" ").toLowerCase();
    if (text.toLowerCase().includes(marker)) continue;
    if (hits.some((h) => h.sentence === sentence)) continue;
    hits.push({ term: entry.term, sentence });
  }
  return hits;
}

interface Registry {
  claim: (owner: string, terms: PlainTermHit[]) => PlainTermHit[];
}

const PlainTermsContext = createContext<Registry | null>(null);

/**
 * Page-scoped claim registry. Mount once per route — remounting (via a `key`
 * on the pathname) clears every claim so the next page starts fresh.
 */
export const PlainTermsProvider = ({ children }: { children: ReactNode }) => {
  const owners = useRef(new Map<string, string>());
  const value = useMemo<Registry>(
    () => ({
      claim: (owner, terms) =>
        terms.filter((t) => {
          const current = owners.current.get(t.term);
          if (!current) {
            owners.current.set(t.term, owner);
            return true;
          }
          return current === owner;
        }),
    }),
    [],
  );
  return <PlainTermsContext.Provider value={value}>{children}</PlainTermsContext.Provider>;
};

/**
 * Terms this block is the first on the page to use. Render the result with
 * `PlainTermsFootnote`. Outside a provider (tests, isolated stories) nothing is
 * de-duplicated but at most two definitions are still returned.
 */
export function usePlainTermFootnotes(
  text: string | null | undefined,
  enabled = true,
): PlainTermHit[] {
  const registry = useContext(PlainTermsContext);
  const owner = useId();
  const found = useMemo(() => (enabled ? collectPlainTerms(text) : []), [text, enabled]);
  return useMemo(() => {
    if (!enabled || found.length === 0) return [];
    const claimed = registry ? registry.claim(owner, found) : found;
    return claimed.slice(0, 2);
  }, [enabled, found, registry, owner]);
}

/**
 * One small icon-led row per definition. The "In plain terms" label is printed
 * once for the whole group — never repeated on each row.
 */
export const PlainTermsFootnote = ({
  terms,
  className,
}: {
  terms: PlainTermHit[];
  className?: string;
}) => {
  if (terms.length === 0) return null;
  return (
    <div className={cn("space-y-1", className)}>
      <p className="flex items-center gap-1.5">
        <Info className="size-3 text-primary shrink-0" aria-hidden />
        <span className="uppercase tracking-[0.14em] text-[9px] font-bold text-primary">
          In plain terms
        </span>
      </p>
      {terms.map((t) => (
        <p
          key={t.term}
          className="pl-[18px] text-[10.5px] leading-snug text-muted-foreground font-body"
        >
          {t.sentence}
        </p>
      ))}
    </div>
  );
};

