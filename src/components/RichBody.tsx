import { useMemo } from "react";
import GuidanceBody from "@/components/guidance/GuidanceBody";
import { normaliseHeatLanguage } from "@/lib/smartInline";
import { capitaliseSentences, splitParagraphs } from "@/lib/paragraphs";
import { parseGuidance } from "@/lib/guidance";

/**
 * RichBody — adapter so nutrition/supplement copy renders through the same
 * guidance anatomy as everywhere else (GuidanceBody).
 *
 * LABELLED-BLOCK GUARANTEE (2026-08-15). A labelled block ("Why it matters:
 * …") must ALWAYS render its body. Downstream shaping (sentence dedupe,
 * paragraph grouping) could previously drop a segment body and leave the
 * styled label heading behind with nothing under it. So labelled blocks are
 * rendered here, deterministically: quiet uppercase header, body directly
 * beneath. Unlabelled prose still routes to GuidanceBody unchanged.
 */
interface RichBodyProps {
  text: string;
  className?: string;
  strandTipLast?: boolean;
}

const RichBody = ({ text, className }: RichBodyProps) => {
  const clean = useMemo(() => normaliseHeatLanguage(String(text ?? "")), [text]);

  const labelled = useMemo(() => {
    const blocks = splitParagraphs(clean);
    const out: { label: string; body: string }[] = [];
    let lead = "";
    blocks.forEach((block) => {
      const parsed = parseGuidance(block);
      if (parsed.segments.length === 0) {
        lead = lead ? `${lead}\n\n${block}` : block;
        return;
      }
      if (parsed.lead.trim()) lead = lead ? `${lead}\n\n${parsed.lead.trim()}` : parsed.lead.trim();
      parsed.segments.forEach((s) => {
        if (s.body.trim()) out.push({ label: s.label, body: s.body.trim() });
      });
    });
    return { lead, sections: out };
  }, [clean]);

  if (labelled.sections.length === 0) {
    return <GuidanceBody text={clean} className={className} keyPrefix="rb" />;
  }

  return (
    <div className={className}>
      {labelled.lead && <GuidanceBody text={labelled.lead} keyPrefix="rb-lead" />}
      <div className={labelled.lead ? "mt-3 space-y-3" : "space-y-3"}>
        {labelled.sections.map((s, i) => (
          <div key={`${s.label}-${i}`} className={i > 0 ? "pt-3 border-t border-border/60" : ""}>
            <p className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-primary/80">
              {s.label}
            </p>
            <p className="mt-1 text-[11.5px] leading-[1.65] text-foreground/85 font-body break-words [overflow-wrap:anywhere]">
              {capitaliseSentences(s.body)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RichBody;
