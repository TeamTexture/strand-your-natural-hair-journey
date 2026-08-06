import { cn } from "@/lib/utils";
import { useSmartInline } from "@/lib/smartInline";

export interface BenefitRow {
  /** 1–2 word label, rendered as a gold letterspaced uppercase micro-label. */
  label: string;
  /** One sentence of supporting copy. */
  text: string;
}

/**
 * BenefitRows — hairline-separated label/sentence rows.
 *
 * Deliberately unfilled: no pills, no chips, no coloured backgrounds. The only
 * colour is the primary/gold token on the label. Inline product links and
 * glossary tokens still resolve through useSmartInline.
 */
const BenefitRows = ({
  benefits,
  idPrefix = "benefit",
  className,
}: {
  benefits: BenefitRow[];
  idPrefix?: string;
  className?: string;
}) => {
  const render = useSmartInline();
  if (!benefits.length) return null;
  return (
    <ul className={cn("divide-y divide-border", className)}>
      {benefits.map((b, i) => (
        <li key={`${idPrefix}-${i}`} className="py-3 first:pt-0 last:pb-0">
          <p className="text-[11px] uppercase tracking-[0.18em] font-bold font-body text-primary">
            {b.label}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed font-body text-foreground break-words">
            {render(b.text, `${idPrefix}-${i}-t`)}
          </p>
        </li>
      ))}
    </ul>
  );
};

export default BenefitRows;
