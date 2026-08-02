import { CuratedSteps } from "@/components/curated/CuratedContent";

/**
 * Non-negotiable education, rendered in level-4 "dummies guide" form.
 *
 * HARDCODED EDUCATION BAN: the copy is NOT written here. Both guides read
 * manuscript-grounded, Paige-published rows from `curated_content`. If a key
 * is not published yet, the guide renders nothing — never a hardcoded version.
 */

export const BeginnerDoubleCleanse = () => (
  <CuratedSteps contentKey="wash-day-steps" title="Washing your hair, step by step" />
);

export const BeginnerTrimEducation = () => (
  <CuratedSteps
    contentKey="trim-length-retention"
    title="Trims and growing your length"
    tone="default"
    reassurance={false}
  />
);
