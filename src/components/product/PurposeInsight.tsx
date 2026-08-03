import { cn } from "@/lib/utils";

/**
 * PurposeInsight — the ONE major, purpose-driven piece of product advice.
 *
 * It replaces the old generic "what this product is made for" explanatory
 * copy and renders the AI's reasoning chain as a single cohesive block:
 * PURPOSE → INGREDIENT EMPHASIS → HER HAIR → IMPLICATION → HOW TO USE.
 *
 * Presentation follows the two-weight emphasis rule: the purpose is the
 * bold lead-in, separated by an em-dash from the rest of the chain.
 */
export interface ProductPurposeInsight {
  purpose: string;
  ingredient_factor: string;
  implication: string;
  usage_direction: string;
}

const clean = (v: unknown): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";

/** Normalises an unknown payload field into the insight shape (or null). */
export function parsePurposeInsight(value: unknown): ProductPurposeInsight | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const insight: ProductPurposeInsight = {
    purpose: clean(row.purpose),
    ingredient_factor: clean(row.ingredient_factor),
    implication: clean(row.implication),
    usage_direction: clean(row.usage_direction),
  };
  const filled = Object.values(insight).filter(Boolean);
  if (!insight.purpose || filled.length < 2) return null;
  return insight;
}

/** Connectives that must stay lower-case so the chain reads as one thought. */
const CONNECTIVE = /^(so|which|and|but|because|then|meaning|that|this)\b/i;

const sentence = (s: string, keepCase = false): string => {
  if (!s) return "";
  const trimmed = s.replace(/[.\s]+$/, "");
  if (!trimmed) return "";
  const first = keepCase || CONNECTIVE.test(trimmed)
    ? trimmed
    : trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return `${first}.`;
};

const leadIn = (purpose: string): string => {
  const p = purpose.replace(/[.\s]+$/, "");
  if (!p) return "";
  return /^(formulated|made|designed|built)\b/i.test(p)
    ? `Because this is ${p.charAt(0).toLowerCase()}${p.slice(1)}`
    : `Because this is made to ${p.charAt(0).toLowerCase()}${p.slice(1)}`;
};

const PurposeInsight = ({
  insight,
  className,
}: {
  insight: ProductPurposeInsight;
  className?: string;
}) => {
  const lead = leadIn(insight.purpose);
  const rest = [
    insight.ingredient_factor,
    insight.implication,
    insight.usage_direction,
  ]
    .map(sentence)
    .filter(Boolean)
    .join(" ");

  return (
    <p className={cn("text-[13px] leading-relaxed text-foreground", className)}>
      <strong className="font-semibold">{lead}</strong>
      {rest ? <> — {rest}</> : "."}
    </p>
  );
};

export default PurposeInsight;
