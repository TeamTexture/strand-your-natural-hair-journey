// Renderers for curated (manuscript-grounded) educational content.
// They render nothing at all when the key has no published row — that absence
// is the point: no hardcoded hair education may ship as a fallback.

import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { BeginnerSteps, DoDont, BeginnerReassurance } from "@/components/beginner/BeginnerGuide";
import TipsBlock from "@/components/tips/TipsBlock";
import type { GuidanceTip } from "@/lib/tipsRender";
import { useCuratedContent, type CuratedKey } from "@/hooks/useCuratedContent";

/** Illustrated, numbered step guide (level-4 "hand-holding" presentation). */
export const CuratedSteps = ({
  contentKey,
  title,
  tone = "gold",
  reassurance = true,
}: {
  contentKey: CuratedKey;
  title: string;
  tone?: "gold" | "default";
  reassurance?: boolean;
}) => {
  const { data } = useCuratedContent(contentKey);
  const steps = data?.steps ?? [];
  if (steps.length === 0) return null;

  return (
    <>
      <SectionLabel>{title}</SectionLabel>
      <SurfaceCard tone={tone === "gold" ? "gold" : undefined}>
        {data?.intro && (
          <p className="text-[12.5px] leading-relaxed text-foreground/85 mb-3">
            {data.intro}
          </p>
        )}
        <BeginnerSteps
          steps={steps.map((s) => ({
            text: s.headline,
            detail: s.body,
            why: s.why,
          }))}
        />
        {((data?.dos?.length ?? 0) > 0 || (data?.donts?.length ?? 0) > 0) && (
          <DoDont className="mt-3" dos={data?.dos ?? []} donts={data?.donts ?? []} />
        )}
        {reassurance && <BeginnerReassurance />}
      </SurfaceCard>
    </>
  );
};

/** Teaching tips rendered through the standard tips pipeline. */
export const CuratedTips = ({
  contentKey,
  idPrefix,
  reassurance,
  wrap = true,
}: {
  contentKey: CuratedKey;
  idPrefix: string;
  reassurance?: string;
  wrap?: boolean;
}) => {
  const { data } = useCuratedContent(contentKey);
  const source = (data?.items?.length ?? 0) > 0 ? data?.items ?? [] : data?.steps ?? [];
  if (source.length === 0) return null;

  const tips: GuidanceTip[] = source.map((item, i) => ({
    priority: source.length - i,
    short: item.body ? `${item.headline} ${item.body}`.trim() : item.headline,
    why: item.why,
  }));

  const block = <TipsBlock idPrefix={idPrefix} reassurance={reassurance} tips={tips} />;
  return wrap ? <SurfaceCard tone="gold">{block}</SurfaceCard> : block;
};
