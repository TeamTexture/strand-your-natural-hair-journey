// The glossary-confidence list — its own card, on purpose.
//
// This used to sit as a footnote inside HomemadeSafetyCard. It is a SUBSET of
// the ingredient list (the names with no glossary row), and when that subset ran
// long it read as though it were the complete recipe sitting under the safety
// heading — so the verdict above looked like it had been written about a
// different product. It now has an unambiguous heading that states the count out
// of the total, and it carries no safety reasoning at all.

import { HelpCircle } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";

interface Props {
  unverified: string[];
  /** Total ingredients on the analysed list, for the "X of Y" framing. */
  total: number;
}

const GlossaryConfidenceCard = ({ unverified, total }: Props) => {
  if (!unverified.length) return null;
  const n = unverified.length;
  const heading = total > 0
    ? `${n} of ${total} ingredients not yet in our glossary`
    : `${n} ${n === 1 ? "ingredient" : "ingredients"} not yet in our glossary`;

  return (
    <SurfaceCard className="p-4 space-y-2 border border-border/60">
      <div className="flex items-start gap-2.5">
        <HelpCircle className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-[0.15em] font-medium text-muted-foreground">
            Glossary coverage
          </p>
          <p className="font-display text-[15px] leading-snug text-foreground">
            {heading}
          </p>
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground leading-relaxed">
        This is not the full ingredient list — only the {n === 1 ? "name" : "names"} we
        could not match to a verified glossary entry. Anything said about{" "}
        {n === 1 ? "it" : "them"} is general reasoning rather than verified fact.
      </p>
      <ul className="flex flex-wrap gap-1.5 pt-0.5">
        {unverified.map((name) => (
          <li
            key={name}
            className="text-[11.5px] rounded-pill border border-border/70 px-2.5 py-1 text-foreground/80"
          >
            {name}
          </li>
        ))}
      </ul>
    </SurfaceCard>
  );
};

export default GlossaryConfidenceCard;
