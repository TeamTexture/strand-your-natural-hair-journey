import { Sparkles, Loader2 } from "lucide-react";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import BenefitRows from "@/components/guidance/BenefitRows";
import NumberedSteps from "@/components/guidance/NumberedSteps";
import { useSmartInline } from "@/lib/smartInline";
import type { BrandGuidance } from "@/hooks/useBrandProductGuidance";

/**
 * BrandPlaybookCard — the FULL personalised read on a brand product, shared by
 * every surface that shows one (the offer page and the standalone brand product
 * page), so a member never sees two different depths of the same reasoning.
 *
 * Rendering rules (paid surface):
 *  - While generating, one spinner line — never an empty card.
 *  - If generation times out or is rejected, the card renders NOTHING. The
 *    brand's own description above already covers the generic case, so a blank
 *    section is better than generic copy dressed as personalisation.
 */
const BrandPlaybookCard = ({
  guidance,
  loading,
  timedOut,
  productName,
  className,
}: {
  guidance: BrandGuidance | null;
  loading?: boolean;
  /** Spinner ceiling passed with nothing to show — drop the section. */
  timedOut?: boolean;
  /** Shown in the eyebrow when a page lists more than one product. */
  productName?: string;
  className?: string;
}) => {
  const render = useSmartInline();
  const hasBody =
    !!guidance &&
    (!!guidance.intro || guidance.benefits?.length > 0 || guidance.steps?.length > 0);

  if (!hasBody) {
    if (!loading || timedOut) return null;
    return (
      <GuidanceCard
        eyebrow={productName ? `For your hair · ${productName}` : "For your hair"}
        icon={Sparkles}
        tone="gold"
        className={`px-5 py-[22px] ${className ?? ""}`}
      >
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-body">
          <Loader2 className="size-3.5 animate-spin" /> Building your personalised read…
        </div>
      </GuidanceCard>
    );
  }

  const g = guidance!;
  const watchOuts = (g.watch_outs ?? []).filter((w) => !!w && w.trim().length > 3);

  return (
    <GuidanceCard
      eyebrow={productName ? `For your hair · ${productName}` : "For your hair"}
      icon={Sparkles}
      tone="gold"
      headline={g.headline || undefined}
      className={`px-5 py-[22px] ${className ?? ""}`}
    >
      <div className="space-y-4">
        {g.intro && (
          <p className="text-[13.5px] leading-relaxed font-body text-foreground/85">
            {render(g.intro, "brand-playbook-intro")}
          </p>
        )}
        {g.benefits?.length > 0 && (
          <div className="pt-1">
            <p className="text-[11px] uppercase tracking-[0.18em] font-bold font-body text-primary mb-2.5">
              Benefits for your hair
            </p>
            <BenefitRows benefits={g.benefits} idPrefix="brand-benefit" />
          </div>
        )}
        {g.steps?.length > 0 && (
          <div className="pt-1">
            <p className="text-[11px] uppercase tracking-[0.18em] font-bold font-body text-primary mb-2.5">
              How to use it for your hair
            </p>
            <NumberedSteps steps={g.steps} idPrefix="brand-step" />
          </div>
        )}
        {watchOuts.length > 0 && (
          <div className="pt-1">
            <p className="text-[11px] uppercase tracking-[0.18em] font-bold font-body text-primary mb-2.5">
              Worth knowing
            </p>
            <ul className="space-y-2">
              {watchOuts.map((w, i) => (
                <li
                  key={`brand-watch-${i}`}
                  className="text-[13px] leading-relaxed font-body text-foreground/85 flex gap-2"
                >
                  <span className="text-primary" aria-hidden>
                    ·
                  </span>
                  <span className="min-w-0">{render(w, `brand-watch-${i}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </GuidanceCard>
  );
};

export default BrandPlaybookCard;
