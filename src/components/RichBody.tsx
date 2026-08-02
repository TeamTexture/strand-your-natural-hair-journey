import { useMemo } from "react";
import GuidanceBody from "@/components/guidance/GuidanceBody";
import { normaliseHeatLanguage } from "@/lib/smartInline";

/**
 * RichBody — thin adapter so nutrition/supplement copy renders through the
 * same guidance anatomy as everywhere else (GuidanceBody): labelled
 * sub-paragraphs become icon-led SegmentBlocks, long paragraphs are chunked
 * at sentence boundaries, and a bold lead-in phrase (never a whole
 * paragraph) opens each block. `strandTipLast` is accepted for backwards
 * compatibility with callers — GuidanceBody already renders a "Strand tip"
 * label as its own gold SegmentBlock, so no separate handling is needed.
 */
interface RichBodyProps {
  text: string;
  className?: string;
  strandTipLast?: boolean;
}

const RichBody = ({ text, className }: RichBodyProps) => {
  const clean = useMemo(() => normaliseHeatLanguage(String(text ?? "")), [text]);
  return <GuidanceBody text={clean} className={className} keyPrefix="rb" />;
};

export default RichBody;
