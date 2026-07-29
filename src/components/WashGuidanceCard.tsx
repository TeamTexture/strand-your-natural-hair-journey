import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { loadClinicalContext } from "@/lib/clinicalContext";
import { useSmartInline } from "@/lib/smartInline";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { limitTips } from "@/lib/tipsLevel";
import TipsLevelPrompt from "@/components/TipsLevelPrompt";

interface HairProfile {
  porosity?: string[];
  density?: string[];
  texture?: string[];
  scalp?: string[];
}

interface Tip {
  /** Higher = more important. Lower support levels keep the highest first. */
  priority: number;
  /** Short-form instruction — always shown. */
  short: string;
  /** The reasoning — shown at level 3+. */
  why: string;
  /** Beginner definition of the technical term — shown at level 4. */
  define?: string;
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
const buildTips = (p: HairProfile | null): Tip[] => {
  if (!p) return [];
  const tips: Tip[] = [];
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

  if (sc.includes("dry") || sc.includes("sensitive")) {
    tips.push({
      priority: 90,
      short: "Keep the two-step cleanse: a gentle scalp cleanse first with fingertip pads only, then a moisturising shampoo through the hair.",
      why: "A dry or sensitive scalp reacts to friction and stripping, so the first pass stays gentle and scalp-focused and the second pass looks after the lengths.",
    });
  } else if (sc.includes("oily")) {
    tips.push({
      priority: 90,
      short: "Make the first cleanse scalp-focused to lift sebum, then follow with a moisturising shampoo through the hair.",
      why: "Two passes lift oil properly without over-washing the lengths, which is what usually causes the dry-ends-greasy-roots pattern.",
      define: "Sebum is the natural oil your scalp produces.",
    });
  }

  if (tex.includes("rough") || tex.includes("crinkly")) {
    tips.push({
      priority: 70,
      short: "Detangle on saturated, conditioner-coated hair, ends first, working up to the roots.",
      why: "Coarser and coily textures break where the bends are, and slip from conditioner plus bottom-up order takes the tension off those points.",
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

  return tips.sort((a, b) => b.priority - a.priority);
};

const WashGuidanceCard = () => {
  const renderTip = useSmartInline();
  const { level, showExplanations, showBeginnerHelp } = useTipsLevel();
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
  const allTips = useMemo(() => buildTips(profile), [profile]);
  const tips = useMemo(() => limitTips(allTips, level), [allTips, level]);
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
        {showBeginnerHelp ? (
          <BeginnerSteps
            key="beginner"
            steps={tips.map((t) => ({
              text: t.short,
              detail: t.why,
              define: t.define,
            }))}
          />
        ) : (
          <ul key={level} className="space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-300">
            {tips.map((t, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-snug">
                <span className="text-primary mt-0.5 shrink-0">•</span>
                <span className="flex-1">
                  {renderTip(t.short, `tip-${i}`)}
                  {showExplanations && (
                    <span className="block text-[11px] text-muted-foreground mt-1">
                      {renderTip(t.why, `why-${i}`)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {showBeginnerHelp && <BeginnerReassurance />}
        <TipsLevelPrompt className="mt-3" />
      </SurfaceCard>
    </div>
  );
};

export default WashGuidanceCard;

