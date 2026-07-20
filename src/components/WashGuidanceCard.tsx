import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { loadClinicalContext } from "@/lib/clinicalContext";

const TEAM_TEXTURE_URL = "https://www.teamtexture.co.uk";

const renderTip = (text: string) => {
  const cleaned = text
    .replace(/\s*\(https?:\/\/(?:www\.)?teamtexture\.co\.uk[^)]*\)/gi, "")
    .replace(/\s*https?:\/\/(?:www\.)?teamtexture\.co\.uk\S*/gi, "");
  return cleaned.split(/(TT Heat Hat)/gi).map((part, index) =>
    /^tt heat hat$/i.test(part) ? (
      <a
        key={index}
        href={TEAM_TEXTURE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary font-semibold underline underline-offset-2"
      >
        {part}
      </a>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
};

interface HairProfile {
  porosity?: string[];
  density?: string[];
  texture?: string[];
  scalp?: string[];
}

/**
 * Build 2–3 short, science-grounded guidance bullets tailored to the user's
 * hair profile. Strictly factual, no marketing language. Sources (general
 * trichology / cosmetic science consensus):
 *  - Porosity ↔ cuticle openness → moisture uptake & retention
 *  - Density → product quantity & sectioning needs
 *  - Texture/curl pattern → mechanical fragility, detangling order
 *  - Scalp condition → cleansing cadence & active ingredients
 */
const buildTips = (p: HairProfile | null): string[] => {
  if (!p) return [];
  const tips: string[] = [];
  const por = (p.porosity?.[0] ?? "").toLowerCase();
  const den = (p.density?.[0] ?? "").toLowerCase();
  const tex = (p.texture?.[0] ?? "").toLowerCase();
  const sc = (p.scalp?.[0] ?? "").toLowerCase();

  if (por.includes("high")) {
    tips.push(
      "High porosity: raised cuticles absorb water fast but lose it just as fast — seal deep conditioner with a leave-in + oil/butter while damp.",
    );
  } else if (por.includes("low")) {
    tips.push(
      "Low porosity: tight cuticles resist water — use warm water and the TT Heat Hat with conditioner to support penetration; avoid heavy proteins.",
    );
  }

  if (sc.includes("dry") || sc.includes("sensitive")) {
    tips.push(
      "Dry/sensitive scalp: choose sulphate-free cleansers and massage gently — over-stripping triggers reactive sebum and irritation.",
    );
  } else if (sc.includes("oily")) {
    tips.push(
      "Oily scalp: a clarifying wash every 1–2 weeks helps; focus shampoo on the scalp, conditioner on mid-lengths to ends only.",
    );
  }

  if (tex.includes("rough") || tex.includes("crinkly")) {
    tips.push(
      "Coarser/coily texture: detangle on saturated, conditioner-coated hair from ends → roots to reduce mechanical breakage.",
    );
  }

  if (den.includes("high") && tips.length < 3) {
    tips.push(
      "High density: section into 4–6 parts before cleansing/conditioning so product reaches the scalp and every strand evenly.",
    );
  }

  return tips.slice(0, 3);
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
        <ul className="space-y-1.5">
          {tips.map((t, i) => (
            <li key={i} className="flex gap-2 text-[12px] leading-snug">
              <span className="text-primary mt-0.5 shrink-0">•</span>
              <span className="flex-1">{renderTip(t)}</span>
            </li>
          ))}
        </ul>
      </SurfaceCard>
    </div>
  );
};

export default WashGuidanceCard;
