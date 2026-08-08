import GuidanceBody from "@/components/guidance/GuidanceBody";

/**
 * Renders any AI-generated or editorial prose at the user's support level.
 *
 * Presentation is delegated entirely to `GuidanceBody`, the shared guidance
 * renderer, so every AI surface in the app inherits the same design: labelled
 * sub-paragraphs become icon-led SegmentBlocks, numbered sequences become
 * StepSequences, and concrete parameters are repeated as KeyFactChips.
 *
 * Level 1 — first sentence only (the direct answer), one tight paragraph.
 * Level 2 — up to three sentences, compact labelled lines.
 * Level 3 — the full text, structured into lead + segment blocks.
 * Level 3 (Hand-holding) — the full text, maximally chunked in plain language.
 */
const AiProse = ({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) => <GuidanceBody text={text} className={className} keyPrefix="ai" />;

export default AiProse;
