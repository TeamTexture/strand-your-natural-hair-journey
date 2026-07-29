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
 * Build science-grounded guidance tailored to the user's hair profile.
 * Strictly factual, no marketing language. Sources (general trichology /
 * cosmetic science consensus):
 *  - Porosity ↔ cuticle openness → moisture uptake & retention
 *  - Density → product quantity & sectioning needs
 *  - Texture/curl pattern → mechanical fragility, detangling order
 *  - Scalp condition → cleansing cadence & active ingredients
 */
const buildTips = (p: HairProfile | null): GuidanceTip[] => {
  if (!p) return [];
  const tips: GuidanceTip[] = [];
  const por = (p.porosity?.[0] ?? "").toLowerCase();
  const den = (p.density?.[0] ?? "").toLowerCase();
  const tex = (p.texture?.[0] ?? "").toLowerCase();
  const sc = (p.scalp?.[0] ?? "").toLowerCase();

  if (por.includes("high")) {
    tips.push({
      priority: 100,
      short: "Seal deep conditioner with a leave-in and an oil or butter while your hair is still damp.",
      why: "High porosity means raised cuticles: water goes in fast and leaves just as fast, so the seal is what holds the moisture in.",
      define: "Porosity is how easily your hair takes in and holds water.",
    });
  } else if (por.includes("low")) {
    tips.push({
      priority: 100,
      short: "Use warm water and the TT Heat Hat with your conditioner, and go easy on protein.",
      why: "Low porosity means tightly-packed cuticles that resist water, so gentle warmth helps conditioner get in rather than sitting on top.",
      define: "Porosity is how easily your hair takes in and holds water.",
    });
  }

  // Two-step cleanse — a non-negotiable. Always shown, depth varies by level.
  if (sc.includes("dry") || sc.includes("sensitive")) {
    tips.push({
      priority: 95,
      short: "Keep the two-step cleanse: a gentle scalp cleanse first with fingertip pads only, then a moisturising shampoo through the hair.",
      why: "A dry or sensitive scalp reacts to friction and stripping, so the first pass stays gentle and scalp-focused and the second pass looks after the lengths.",
      dos: ["Use your fingertip pads on the scalp", "Do a second cleanse down the lengths"],
      donts: ["Scratch with your nails", "Skip the second wash"],
      alwaysShow: true,
    });
  } else if (sc.includes("oily")) {
    tips.push({
      priority: 95,
      short: "Make the first cleanse scalp-focused to lift sebum, then follow with a moisturising shampoo through the hair.",
      why: "Two passes lift oil properly without over-washing the lengths, which is what usually causes the dry-ends-greasy-roots pattern.",
      define: "Sebum is the natural oil your scalp produces.",
      dos: ["Focus wash one on the scalp", "Do a second wash down the lengths"],
      donts: ["Skip straight to conditioner", "Use one wash for scalp and lengths"],
      alwaysShow: true,
    });
  } else {
    tips.push({
      priority: 95,
      short: "Keep the two-step cleanse: scalp first with fingertip pads, then a second wash through the lengths.",
      why: "One pass rarely cleans both the scalp and the hair properly — splitting it into two keeps each part cared for on its own terms.",
      dos: ["Use your fingertip pads on the scalp", "Do a second cleanse down the lengths"],
      donts: ["Scratch with your nails", "Skip the second wash"],
      alwaysShow: true,
    });
  }

  if (tex.includes("rough") || tex.includes("crinkly")) {
    tips.push({
      priority: 70,
      short: "Detangle on saturated, conditioner-coated hair, ends first, working up to the roots.",
      why: "Coarser and coily textures break where the bends are, and slip from conditioner plus bottom-up order takes the tension off those points.",
      dos: ["Detangle with conditioner in", "Work from ends to roots"],
      donts: ["Comb dry, bare hair", "Start detangling at the root"],
    });
  }

  if (den.includes("high")) {
    tips.push({
      priority: 60,
      short: "Section into four to six parts before you start.",
      why: "With high density, product and water can't reach the scalp evenly in one go — sectioning is what makes both cleanses actually land.",
      define: "Density is how many strands you have on your head, not how thick each strand is.",
    });
  }

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
      <SurfaceCard tone="gold">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="size-4 text-primary" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium">
            For your hair today
          </p>
        </div>
        <TipsBlock tips={tips} idPrefix="wash-guidance" />
        <TipsLevelPrompt className="mt-3" />
      </SurfaceCard>
    </div>
  );
};

export default WashGuidanceCard;
