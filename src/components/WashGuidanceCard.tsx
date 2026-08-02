import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { loadClinicalContext } from "@/lib/clinicalContext";
import TipsBlock from "@/components/tips/TipsBlock";
import type { GuidanceTip } from "@/lib/tipsRender";
import TipsLevelPrompt from "@/components/TipsLevelPrompt";

interface HairProfile {
  porosity?: string[];
  density?: string[];
  texture?: string[];
  scalp?: string[];
}

/**
 * Wash-day guidance for this user's hair, in the order the wash day happens:
 * prep → cleanse → condition and heat → rinse and seal → style.
 *
 * Grounded in the How To Love Your Afro manuscript, including its moisture
 * hierarchy: water is the moisturiser, gentle heat drives it in, cooling and a
 * cool-water rinse smoothed down with the fingers is what actually seals it,
 * and a leave-in or butter is a secondary step that only slows evaporation.
 * The card must never present product layering as the key to moisture.
 */
const buildTips = (p: HairProfile | null): GuidanceTip[] => {
  if (!p) return [];
  const tips: GuidanceTip[] = [];
  const por = (p.porosity?.[0] ?? "").toLowerCase();
  const den = (p.density?.[0] ?? "").toLowerCase();
  const tex = (p.texture?.[0] ?? "").toLowerCase();
  const sc = (p.scalp?.[0] ?? "").toLowerCase();
  const highPor = por.includes("high");
  const lowPor = por.includes("low");
  const dense = den.includes("high");
  const coarse = tex.includes("rough") || tex.includes("crinkly");

  /* ---------- 1. Before you start ---------- */
  if (dense) {
    tips.push({
      priority: 91,
      stage: "prep",
      short: "Section your hair into four to six parts before anything gets wet.",
      why: "Your density means water and product cannot reach the scalp evenly in one go, so sectioning is what makes every later step actually land. Density is how many strands you have on your head rather than how thick each strand is.",
    });
  }
  tips.push({
    priority: 90,
    stage: "prep",
    short: "Soak your hair through before any shampoo touches it.",
    why: lowPor
      ? "Water is the only true moisturiser, and low porosity means a closed cuticle that resists water at first, so keep working the water in by sections until every curl is heavy and dripping. Judge it by the hair, not the clock — it takes as long as it takes."
      : "Water is the only true moisturiser, and a dry patch never gets properly cleansed or conditioned. Work the water in by sections until every curl is heavy and dripping, including the nape, crown and dense middle. Judge it by the hair, not the clock.",
    dos: ["Lift and separate so water reaches the scalp", "Keep going until curls are heavy and dripping"],
    donts: ["Rush this step", "Start shampoo on half-wet hair"],
    alwaysShow: true,
  });

  /* ---------- 2. Cleanse ---------- */
  if (sc.includes("dry") || sc.includes("sensitive")) {
    tips.push({
      priority: 95,
      stage: "cleanse",
      short: "Cleanse twice: a gentle scalp cleanse with your fingertip pads, then a moisturising shampoo through the lengths.",
      why: "A dry or sensitive scalp reacts to friction and stripping, so the first pass stays gentle and scalp-focused while the second pass looks after the hair itself.",
      dos: ["Use your fingertip pads on the scalp", "Do a second cleanse down the lengths"],
      donts: ["Scratch with your nails", "Skip the second wash"],
      alwaysShow: true,
    });
  } else if (sc.includes("oily")) {
    tips.push({
      priority: 95,
      stage: "cleanse",
      short: "Cleanse twice: wash one lifts sebum from the scalp, wash two runs a moisturising shampoo through the lengths.",
      why: "Two passes lift the natural oil your scalp produces without over-washing the hair, which is what usually creates the dry-ends and greasy-roots pattern.",
      dos: ["Focus wash one on the scalp", "Do a second wash down the lengths"],
      donts: ["Skip straight to conditioner", "Use one wash for scalp and lengths"],
      alwaysShow: true,
    });
  } else {
    tips.push({
      priority: 95,
      stage: "cleanse",
      short: "Cleanse twice: scalp first with your fingertip pads, then a second wash through the lengths.",
      why: "One pass rarely cleans both the scalp and the hair properly, so splitting it in two keeps each part cared for on its own terms.",
      dos: ["Use your fingertip pads on the scalp", "Do a second cleanse down the lengths"],
      donts: ["Scratch with your nails", "Skip the second wash"],
      alwaysShow: true,
    });
  }

  /* ---------- 3. Condition and heat ---------- */
  tips.push({
    priority: 99,
    stage: "condition",
    short: "Always follow shampoo with conditioner, and use gentle heat with the TT Heat Hat for 20 to 30 minutes.",
    why: lowPor
      ? "Shampoo lifts the cuticle; conditioner lowers and smooths it again. Low porosity means tightly-packed scales that hold product on the surface, so gentle warmth is what gets it past them and into the strand. This is the highest-impact moisture step you have."
      : "Shampoo lifts the cuticle; conditioner lowers and smooths it again. Gentle warmth lets the conditioning agents move past the surface and into the cortex, which is where moisture has to be if it is going to last. This is the highest-impact moisture step you have.",
    dos: ["Wear the heat for the full 20 to 30 minutes", "Check whether your conditioner is designed for heat"],
    donts: ["Skip conditioner after shampoo", "Substitute a plastic cap or a warm towel"],
    alwaysShow: true,
  });
  if (coarse) {
    tips.push({
      priority: 70,
      stage: "condition",
      short: "Detangle while the conditioner is still in, on saturated hair, ends first and working up to the roots.",
      why: "Coarser and coily textures break where the bends are, and the slip from conditioner plus the bottom-up order takes the tension off those exact points.",
      dos: ["Detangle with conditioner in", "Work from ends to roots"],
      donts: ["Comb dry, bare hair", "Start detangling at the root"],
    });
  }

  /* ---------- 4. Rinse and seal ---------- */
  tips.push({
    priority: 98,
    stage: "seal",
    short: "Let your hair cool, then rinse with cool water while smoothing downwards with the flat of your fingers.",
    why: "This is the step that actually seals moisture in. Warmth was used deliberately to open the cuticle; cooling and cool water do the opposite and encourage those scales to lie flat over the water now inside the strand. The scales overlap in one direction like roof tiles, so stroking root to tip with the water flow closes them the right way, which is why the hair comes out shinier, smoother and still soft days later.",
    dos: ["Rinse cool, root to tip, section by section", "Smooth with the flat of your fingers"],
    donts: ["Rinse warm and rush off", "Rub or scrunch upwards"],
    alwaysShow: true,
  });
  tips.push({
    priority: 80,
    stage: "seal",
    short: "Then, on damp hair, add your leave-in and an oil or butter — as a supporting step, not the main one.",
    why: highPor
      ? "High porosity means raised cuticles, so water leaves as readily as it goes in and the barrier is worth adding. Be clear about what it does though: a product lubricates the strand and slows evaporation, it cannot stop it. The cool-water rinse you just did is what holds the moisture in, and no amount of layering replaces it."
      : "A leave-in and an emollient lubricate the strand and add a barrier while your hair is still damp, which slows evaporation. It cannot stop it, and it cannot make up for skipping the heat and cool-rinse sequence, so treat it as the finishing touch rather than the moisture strategy.",
    dos: ["Apply while the hair is still damp"],
    donts: ["Rely on layering instead of the heat and cool rinse", "Seal onto dry hair"],
  });

  /* ---------- 5. Style and finish ---------- */
  tips.push({
    priority: 60,
    stage: "style",
    short: "Style on damp hair with low manipulation, and protect your ends as you finish.",
    why: coarse
      ? "Hair is at its most fragile when wet and your texture snags at the bends, so styling gently while there is still slip in the hair keeps breakage down and holds the moisture you just sealed in."
      : "Hair is at its most fragile when wet, so gentle handling while there is still slip protects the moisture you just sealed and keeps the ends, your oldest hair, intact.",
    dos: ["Work in the sections you already made", "Keep the ends tucked or smoothed"],
    donts: ["Pull tight at the scalp", "Handle roughly while wet"],
  });

  return tips;
};

const WashGuidanceCard = () => {
  const [profile, setProfile] = useState<HairProfile | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ctx = await loadClinicalContext();
      if (cancelled) return;
      setProfile(
        ctx.hair
          ? {
              porosity: ctx.hair.porosity,
              density: ctx.hair.density,
              texture: ctx.hair.texture,
              scalp: ctx.hair.scalp,
            }
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const tips = useMemo(() => buildTips(profile), [profile]);
  if (tips.length === 0) return null;

  return (
    <div className="px-5 mb-3">
      <GuidanceCard
        eyebrow="For your hair today"
        icon={Sparkles}
        tone="gold"
        footer={<TipsLevelPrompt />}
      >
        <TipsBlock tips={tips} idPrefix="wash-guidance" />
      </GuidanceCard>
    </div>
  );

};

export default WashGuidanceCard;
