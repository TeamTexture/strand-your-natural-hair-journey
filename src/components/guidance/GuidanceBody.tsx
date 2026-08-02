import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { useSmartInline } from "@/lib/smartInline";
import { plainLanguage } from "@/components/beginner/BeginnerGuide";
import { condenseProse, splitSentences } from "@/lib/tipsRender";
import {
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
 * Design responds to the support level:
 *  1 Minimal      — one tight paragraph, no chips, small footprint.
 *  2 Essentials   — lead paragraph + labelled segments as plain tinted lines.
 *  3 Guided       — lead paragraph (max ~3 lines before a visual break) plus a
 *                   SegmentBlock per labelled sub-paragraph, with key chips.
 *  4 Hand-holding — everything visible at once, heavily chunked: sequences
 *                   become StepSequences, every segment gets its own block,
 *                   plain-language wording, generous spacing.
 *
 * No guidance text is ever dropped at level 3+ — only its structure changes.
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
  const { level, showBeginnerHelp } = useTipsLevel();
  const render = useSmartInline();

  const condensed = useMemo(() => condenseProse(text, level), [text, level]);
  const parsed = useMemo(() => parseGuidance(condensed), [condensed]);

  if (!condensed) return null;

  const leadRaw = parsed.lead;
  const lead = showBeginnerHelp ? plainLanguage(leadRaw) : leadRaw;
  const leadSteps = looksSequential(lead) ? splitNumberedSteps(lead) : [];
  const leadSentences = splitSentences(lead);

  // Level 1–2: a single tight paragraph, segments appended as compact lines.
  if (level <= 2) {
    return (
      <div key={level} className={cn("space-y-2 animate-in fade-in-0 duration-300", className)}>
        {lead && (
          <p className="text-[13px] leading-relaxed text-foreground/85 font-body break-words">
            {render(lead, `${keyPrefix}-lead`)}
          </p>
        )}
        {parsed.segments.map((s, i) => (
          <p key={i} className="text-[12.5px] leading-relaxed text-foreground/80 font-body break-words">
            <span className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-primary mr-1.5">
              {s.label}
            </span>
            {render(s.body, `${keyPrefix}-s${i}`)}
          </p>
        ))}
      </div>
    );
  }

  // Level 3–4: structured. At level 4 the lead is broken into one icon-led
  // line per sentence so nothing arrives as a wall of text.
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
        lead && (
          <div className={showBeginnerHelp ? "space-y-2" : "space-y-2"}>
            {(showBeginnerHelp
              ? leadSentences
              : chunk(leadSentences, 3)
            ).map((line, i) => (
              <p
                key={i}
                className="text-[13px] leading-relaxed text-foreground/85 font-body break-words"
              >
                {render(showBeginnerHelp ? plainLanguage(line) : line, `${keyPrefix}-l${i}`)}
              </p>
            ))}
          </div>
        )
      )}

      {lead && <KeyFactChips text={lead} />}

      {parsed.segments.map((s, i) => (
        <SegmentBlock key={`${s.label}-${i}`} segment={s} keyPrefix={`${keyPrefix}-s${i}`} />
      ))}
    </div>
  );
};

/** Group sentences into paragraphs of at most `size` sentences (~3 lines). */
function chunk(sentences: string[], size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += size) {
    out.push(sentences.slice(i, i + size).join(" "));
  }
  return out.filter(Boolean);
}

export default GuidanceBody;
