import { Sparkles } from "lucide-react";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import TipsLevelPrompt from "@/components/TipsLevelPrompt";
import { CuratedTips } from "@/components/curated/CuratedContent";
import { useCuratedContent } from "@/hooks/useCuratedContent";

/**
 * Wash-day guidance in the order the wash day happens: prep → cleanse →
 * condition and heat → rinse and seal → style.
 *
 * HARDCODED EDUCATION BAN: this card used to build its tips from hand-written
 * copy in this file. It now renders only the manuscript-grounded, published
 * `wash-day-guidance` row from `curated_content`. When nothing is published,
 * the card does not render — personalised guidance comes from the AI surfaces,
 * which are grounded on every generation.
 */
const WashGuidanceCard = () => {
  const { data } = useCuratedContent("wash-day-guidance");
  if (!data) return null;

  return (
    <div className="px-5 mb-3">
      <GuidanceCard
        eyebrow="For your hair today"
        icon={Sparkles}
        tone="gold"
        footer={<TipsLevelPrompt />}
      >
        <CuratedTips contentKey="wash-day-guidance" idPrefix="wash-guidance" wrap={false} />
      </GuidanceCard>
    </div>
  );
};

export default WashGuidanceCard;
