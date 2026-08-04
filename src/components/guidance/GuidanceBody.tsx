import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { splitParagraphs } from "@/lib/paragraphs";
import { useSmartInline } from "@/lib/smartInline";
import { plainLanguage } from "@/components/beginner/BeginnerGuide";
import {
  condenseProse,
  dedupeSentences,
  emphasisSplit,
  splitToBlocks,
} from "@/lib/tipsRender";
import {
  createIconPicker,
  looksSequential,
  parseGuidance,
  splitNumberedSteps,
} from "@/lib/guidance";
import SegmentBlock from "@/components/guidance/SegmentBlock";
import StepSequence from "@/components/guidance/StepSequence";
import KeyFactChips from "@/components/guidance/KeyFactChips";

/**
 * GuidanceBody — the single renderer every block of AI / editorial prose in the
 * consumer app goes through (AiProse and RichBody both route here).
 *
 * Rules enforced here, whatever the model returned:
 *  - No sentence is shown twice within one block of guidance.
 *  - No rendered paragraph runs past ~2 sentences / 40 words. Longer prose is
 *    split at sentence boundaries into separate blocks — never truncated.
 *  - Dense blocks lead with a bold first sentence, the rest as lighter
 *    secondary text.
 *    footnote — never appended inline to several blocks.
 *
 * Level response:
 *  1 Minimal      — one tight paragraph, no chips.
 *  2 Essentials   — lead paragraph + labelled segments as plain tinted lines.
 *  3 Guided       — lead blocks + a SegmentBlock per labelled sub-paragraph.
 *  4 Hand-holding — MORE blocks, not longer ones: every piece its own row.
 */
const GuidanceBlock = ({
  text,
  className,
  keyPrefix = "gb",
}: {
  text: string | null | undefined;
  className?: string;
  keyPrefix?: string;
}) => {
  const { level, showBeginnerHelp } = useTipsLevel();
  const render = useSmartInline();

  const condensed = useMemo(() => condenseProse(text, level), [text, level]);
  const parsed = useMemo(() => parseGuidance(condensed), [condensed]);

  // One shared "seen" set: the lead is deduped first, then each segment is
  // deduped against everything already rendered above it.
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const lead = dedupeSentences(plainLanguage(parsed.lead), seen);
    const segments = parsed.segments
      .map((s) => ({ ...s, body: dedupeSentences(plainLanguage(s.body), seen) }))
      .filter((s) => s.body.trim().length > 0);
    return { lead, segments };
  }, [parsed]);

  if (!condensed) return null;

  const lead = deduped.lead;
  const leadSteps = looksSequential(lead) ? splitNumberedSteps(lead) : [];
  const leadBlocks = splitToBlocks(lead);
  // ICON DISCIPLINE: one picker per rendered body — no icon is ever repeated,
  // and a line with no confident match gets a neutral dot instead of a wrong
  // icon.
  const pickIcon = createIconPicker();

  // Level 1–2: a single tight paragraph, segments appended as compact lines.
  if (level <= 2) {
    return (
      <div key={level} className={cn("space-y-2 animate-in fade-in-0 duration-300", className)}>
        {leadBlocks.map((block, i) => (
          <p
            key={i}
            className="text-[11.5px] leading-[1.55] text-foreground/85 font-body break-words"
          >
            {render(block, `${keyPrefix}-lead${i}`)}
          </p>
        ))}
        {deduped.segments.map((s, i) => (
          <p key={i} className="text-[11px] leading-[1.55] text-foreground/80 font-body break-words">
            <span className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-primary mr-1.5">
              {s.label}
            </span>
            {render(s.body, `${keyPrefix}-s${i}`)}
          </p>
        ))}
      </div>
    );
  }

  // Level 3–4: structured. Every lead block is one icon-led row inside the
  // block budget, with its first sentence bolded as the lead-in.
  return (
    <div
      key={level}
      className={cn(
        showBeginnerHelp ? "space-y-3.5" : "space-y-3",
        "animate-in fade-in-0 duration-300",
        className,
      )}
    >
      {leadSteps.length > 0 ? (
        <StepSequence steps={leadSteps.map((t) => ({ text: t }))} />
      ) : (
        leadBlocks.length > 0 && (
          <ul className="space-y-1.5">
            {leadBlocks.map((block, i) => {
              const LineIcon = pickIcon(block);
              const { phrase, rest } = emphasisSplit(block);
              return (
                <li
                  key={i}
                  className="flex gap-2 rounded-[10px] bg-primary/[0.045] border border-primary/10 px-2.5 py-2"
                >
                  <span className="mt-[3px] inline-flex items-center justify-center size-4 shrink-0 rounded-full bg-primary/12">
                    <LineIcon className="size-2.5 text-primary" aria-hidden />
                  </span>
                  <p className="flex-1 min-w-0 text-[11.5px] leading-[1.55] font-body break-words">
                    <span className="text-foreground font-semibold">
                      {render(phrase, `${keyPrefix}-l${i}`)}
                    </span>
                    {rest && (
                      <span className="text-foreground/75">
                        {" "}
                        {render(rest, `${keyPrefix}-l${i}-rest`)}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )
      )}


      {lead && <KeyFactChips text={lead} />}

      {deduped.segments.map((s, i) => (
        <SegmentBlock key={`${s.label}-${i}`} segment={s} keyPrefix={`${keyPrefix}-s${i}`} />
      ))}

    </div>
  );
};

/**
 * PARAGRAPH SHAPE — the AI is instructed to break at the reasoning bridge
 * (mechanism → what it means for you → what to do with it) with a blank line.
 * Every blank-line block renders as its own spaced paragraph; sentence dedupe
 * runs across the whole set so nothing repeats between paragraphs.
 */
const GuidanceBody = ({
  text,
  className,
  keyPrefix = "gb",
}: {
  text: string | null | undefined;
  className?: string;
  keyPrefix?: string;
}) => {
  const { level } = useTipsLevel();

  const paragraphs = useMemo(() => {
    const blocks = splitParagraphs(text);
    if (blocks.length === 0) return [];
    // Lower levels keep fewer paragraphs — never shorter mid-thought prose.
    const limited = level === 1 ? blocks.slice(0, 1) : level === 2 ? blocks.slice(0, 2) : blocks;
    const seen = new Set<string>();
    return limited
      .map((block) => dedupeSentences(condenseProse(block, level), seen).trim())
      .filter(Boolean);
  }, [text, level]);

  if (paragraphs.length === 0) return null;
  if (paragraphs.length === 1) {
    return <GuidanceBlock text={paragraphs[0]} className={className} keyPrefix={keyPrefix} />;
  }
  return (
    <div className={cn("space-y-3", className)}>
      {paragraphs.map((block, i) => (
        <GuidanceBlock key={i} text={block} keyPrefix={`${keyPrefix}-p${i}`} />
      ))}
    </div>
  );
};

export default GuidanceBody;
