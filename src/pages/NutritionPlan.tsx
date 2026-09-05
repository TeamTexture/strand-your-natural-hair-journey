import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { useTipsLevel } from "@/hooks/useTipsLevel";

import SurfaceCard from "@/components/SurfaceCard";
import RichBody from "@/components/RichBody";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import LoadingDot from "@/components/LoadingDot";
import { Pill, Leaf, Ban, Sparkles, Info, ChefHat, Heart, ChevronDown, Clock, Trash2, AlertTriangle, Lock } from "lucide-react";
import { capitaliseSentences } from "@/lib/paragraphs";

import { readBloodData } from "@/lib/bloodRead";
import OptionalBadge from "@/components/blood/OptionalBadge";
import { useAuth } from "@/hooks/useAuth";

import KeyFactChips from "@/components/guidance/KeyFactChips";
import { Stethoscope } from "lucide-react";
import { buildAiContext } from "@/lib/aiContext";
import { aiInvoke, isAuthInvokeError } from "@/lib/aiInvoke";
import { loadClinicalContext } from "@/lib/clinicalContext";
import { useSavedMeals, mealKey, type MealDraft, type SavedMeal } from "@/hooks/useSavedMeals";
import { toast } from "sonner";
import AiProse from "@/components/tips/AiProse";
import { hasRenderableAiText } from "@/lib/smartInline";

import { condenseProse, limitSupporting, wantsDetail, wantsWhy } from "@/lib/tipsRender";
import type { TipsLevel } from "@/lib/tipsLevel";
import { smartBack } from "@/lib/smartBack";
import { canonDiet, suppressesAnimalFoods, type DietaryPattern } from "@/lib/dietaryPattern";
import AiProgressBar from "@/components/AiProgressBar";
import SensitivityCaptureCard from "@/components/sensitivity/SensitivityCaptureCard";
import SensitivitySheet from "@/components/sensitivity/SensitivitySheet";
import AvoidingSummary from "@/components/sensitivity/AvoidingSummary";
import { useSensitivityCapture } from "@/hooks/useSensitivityCapture";
import NutrientGapNote from "@/components/sensitivity/NutrientGapNote";
import MySupplementsSection from "@/components/nutrition/MySupplementsSection";
import MealLogZone from "@/components/nutrition/MealLogZone";
import {
  readNutritionInputs,
  readConfirmedFingerprint,
  writeConfirmedFingerprint,
} from "@/lib/nutritionInputs";


type Diet = DietaryPattern;
type Alcohol = "none" | "light" | "moderate" | "heavy" | "unknown";

interface Profile {
  diet: Diet;
  /** Free text for "Other" members — what they told us they avoid. */
  dietOther: string;
  alcohol: Alcohol;
  flagged: Set<string>;
}

interface AiCard { emoji: string; name: string; body: string; severity?: string }
interface AiSupplement { emoji: string; name: string; dose?: string; body: string; priority?: "high" | "medium" | "low" }
interface AiPlan { summary?: string; supplements?: AiSupplement[]; diet?: AiCard[]; avoid?: AiCard[] }

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-body font-medium">
    {children}
  </p>
);

const SourceNote = ({ children }: { children?: React.ReactNode }) => (
  <p className="text-[11px] italic text-muted-foreground font-body mt-2 px-1 leading-relaxed">
    {children ?? "Based on How To Love Your Afro by Paige Lewin"}
  </p>
);

// ── Aesthetic card primitives ────────────────────────────────────────────


const IconBubble = ({
  emoji,
  tone,
}: {
  emoji: string;
  tone: "gold" | "good" | "destructive" | "warn";
}) => {
  const toneCls: Record<string, string> = {
    gold: "bg-primary/15 ring-1 ring-primary/30",
    good: "bg-good/15 ring-1 ring-good/30",
    destructive: "bg-destructive/10 ring-1 ring-destructive/30",
    warn: "bg-warn/15 ring-1 ring-warn/30",
  };
  return (
    <div
      className={`size-11 shrink-0 rounded-full flex items-center justify-center text-[22px] ${toneCls[tone]}`}
    >
      <span aria-hidden>{emoji}</span>
    </div>
  );
};

const PriorityChip = ({ level }: { level?: "high" | "medium" | "low" }) => {
  if (!level) return null;
  const map: Record<string, { cls: string; label: string }> = {
    high: { cls: "bg-primary text-primary-foreground", label: "Priority" },
    medium: { cls: "bg-primary/20 text-primary", label: "Recommended" },
    low: { cls: "bg-secondary text-secondary-foreground", label: "Optional" },
  };
  const p = map[level];
  return (
    <span className={`inline-block px-2 py-[3px] rounded-full text-[10px] uppercase tracking-[0.14em] font-semibold ${p.cls}`}>
      {p.label}
    </span>
  );
};

const SeverityChip = ({ level }: { level?: string }) => {
  if (!level) return null;
  const map: Record<string, { cls: string; label: string }> = {
    high: { cls: "bg-destructive text-destructive-foreground", label: "Limit" },
    medium: { cls: "bg-warn/20 text-warn", label: "Reduce" },
    low: { cls: "bg-secondary text-secondary-foreground", label: "Watch" },
  };
  const p = map[level] ?? map.low;
  return (
    <span className={`inline-block px-2 py-[3px] rounded-full text-[10px] uppercase tracking-[0.14em] font-semibold ${p.cls}`}>
      {p.label}
    </span>
  );
};

// Every labelled part of a card body ("Why it matters", "How to use it",
// "Best paired with", "Watch out for") is rendered as its own quiet section
// header with the body directly beneath it. Never inline, never a step.
const CARD_LABELS = [
  "How to use it", "How to use", "How to take", "How to eat", "How to prepare",
  "Best paired with", "Pair with", "Best with", "Try this", "Do this",
  "Watch out for", "Watch out", "Watch for",
  "Why it matters", "Why this matters", "Why it helps", "Your signal", "Your focus",
  "Best sources", "Easier swap", "The action", "The rationale", "Note", "Strand tip",
];

interface CardSection { label: string; body: string }

const normaliseLabel = (label: string) =>
  /^watch\s*(out|for)?$/i.test(label.trim()) ? "Watch out for" : label.trim();

const splitCardSections = (raw: string): { lead: string; sections: CardSection[] } => {
  const text = String(raw ?? "")
    .replace(/\\n/g, "\n")
    .replace(/\/n\/n/g, "\n\n")
    .replace(/\/n/g, "\n");
  const labelRe = new RegExp(`\\*{0,2}\\b(${CARD_LABELS.join("|")})\\b\\s*(?::\\s*\\*{0,2}|\\*{0,2}\\s*:)\\*{0,2}\\s*`, "gi");
  const matches = Array.from(text.matchAll(labelRe));
  if (matches.length === 0) return { lead: text.trim(), sections: [] };

  const leadParts: string[] = [];
  const sections: CardSection[] = [];
  let cursor = 0;

  matches.forEach((match, idx) => {
    const start = match.index ?? 0;
    if (start > cursor) leadParts.push(text.slice(cursor, start));
    const label = normaliseLabel(String(match[1] ?? ""));
    const bodyStart = start + match[0].length;
    const bodyEnd = idx + 1 < matches.length ? matches[idx + 1].index ?? text.length : text.length;
    const body = text.slice(bodyStart, bodyEnd).trim();
    if (body) sections.push({ label, body });
    cursor = bodyEnd;
  });

  if (cursor < text.length) leadParts.push(text.slice(cursor));

  return {
    lead: leadParts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim(),
    sections,
  };
};

/** Renders **bold** inline without ever dropping the surrounding text. */
const inlineBold = (text: string, keyBase: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? (
      <strong key={`${keyBase}-${i}`} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyBase}-${i}`}>{part}</span>
    ),
  );

const SECTION_BODY_CLS =
  "text-[11.5px] leading-[1.65] text-foreground/85 font-body break-words [overflow-wrap:anywhere]";

const CardSections = ({
  sections,
  keyBase,
}: {
  sections: CardSection[];
  keyBase: string;
}) => {
  if (sections.length === 0) return null;
  let plainSeen = 0;
  return (
    <div className="mt-3 space-y-3">
      {sections.map((s, i) => {
        const isWarn = /^watch out for$/i.test(s.label);
        const body = capitaliseSentences(s.body);
        if (isWarn) {
          return (
            <div
              key={`${keyBase}-sec${i}`}
              className="rounded-[12px] border border-warn/30 bg-warn/10 px-3 py-2.5"
            >
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="size-3 text-warn shrink-0" aria-hidden />
                <p className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-warn">
                  {s.label}
                </p>
              </div>
              <p className={`mt-1.5 ${SECTION_BODY_CLS}`}>{inlineBold(body, `${keyBase}-w${i}`)}</p>
            </div>
          );
        }
        const divider = plainSeen > 0 ? "pt-3 border-t border-border/60" : "";
        plainSeen += 1;
        return (
          <div key={`${keyBase}-sec${i}`} className={divider}>
            <p className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-primary/80">
              {s.label}
            </p>
            <p className={`mt-1 ${SECTION_BODY_CLS}`}>{inlineBold(body, `${keyBase}-p${i}`)}</p>
          </div>
        );
      })}
    </div>
  );
};

const FallbackNote = () => (
  <p className="mt-3 text-[10.5px] leading-relaxed italic text-muted-foreground font-body border-t border-border/60 pt-2">
    General guidance — not yet personalised to you. Your own plan will replace this once it finishes generating.
  </p>
);

/**
 * Nutrition/diet guidance is intentionally EXEMPT from the guidance-level
 * scale: it always renders at full detail (level 3) so the member gets the
 * complete personalised plan — every supplement, every meal idea, every
 * avoid — regardless of the global support level.
 */
const useNutritionLevel = () => {
  const { showBeginnerHelp } = useTipsLevel();
  return { level: 3 as TipsLevel, showBeginnerHelp };
};

const SupplementCard = ({ s, isFallback }: { s: AiSupplement; isFallback?: boolean }) => {
  const { lead, sections } = splitCardSections(s.body);
  return (
    <SurfaceCard className="border-l-4 border-l-primary">
      <div className="flex items-start gap-2.5">
        <IconBubble emoji={s.emoji || "💊"} tone="gold" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-display text-[17px] leading-tight text-foreground break-words [overflow-wrap:anywhere] min-w-0">
              {s.name}
            </p>
            <div className="shrink-0">
              <PriorityChip level={s.priority} />
            </div>
          </div>
          {s.dose && (
            <div className="mt-1.5 inline-flex items-start gap-1.5 rounded-md bg-primary/10 px-2 py-1 max-w-full">
              <Pill className="size-3 text-primary shrink-0 mt-[2px]" />
              <p className="text-[11px] font-body font-medium text-primary tracking-wide break-words [overflow-wrap:anywhere] min-w-0">
                {s.dose}
              </p>
            </div>
          )}
        </div>
      </div>
      {lead && <RichBody text={lead} className="mt-2.5" />}
      <CardSections sections={sections} keyBase={`supp-${s.name}`} />
      {isFallback && <FallbackNote />}
    </SurfaceCard>
  );
};

const DietCard = ({ c }: { c: AiCard }) => {
  const { lead, sections } = splitCardSections(c.body);
  return (
    <SurfaceCard className="border-l-4 border-l-good">
      <div className="flex items-center gap-2.5">
        <IconBubble emoji={c.emoji || "🥗"} tone="good" />
        <p className="flex-1 min-w-0 font-display text-[17px] leading-tight text-foreground break-words [overflow-wrap:anywhere]">
          {c.name}
        </p>
      </div>
      {lead && <RichBody text={lead} className="mt-2.5" />}
      <CardSections sections={sections} keyBase={`diet-${c.name}`} />
    </SurfaceCard>
  );
};

const AvoidCard = ({ c }: { c: AiCard }) => {
  const { lead, sections } = splitCardSections(c.body);
  return (
    <SurfaceCard className={`border-l-4 ${c.severity === "high" ? "border-l-destructive" : "border-l-warn"}`}>
      <div className="flex items-start gap-2.5">
        <IconBubble emoji={c.emoji || "⚠️"} tone={c.severity === "high" ? "destructive" : "warn"} />
        <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
          <p className="font-display text-[17px] leading-tight text-foreground break-words [overflow-wrap:anywhere] min-w-0">
            {c.name}
          </p>
          <div className="shrink-0">
            <SeverityChip level={c.severity} />
          </div>
        </div>
      </div>
      {lead && <RichBody text={lead} className="mt-2.5" />}
      <CardSections sections={sections} keyBase={`avoid-${c.name}`} />
    </SurfaceCard>
  );
};


// ── Meal cards ───────────────────────────────────────────────────────────

interface AiMeal {
  emoji: string;
  name: string;
  cuisine?: string;
  time_minutes?: number;
  summary?: string;
  targets?: string[];
  ingredients?: string[];
  steps?: string[];
}

const MealCard = ({
  meal,
  saved,
  onToggleSave,
  onDelete,
  footer,
}: {
  meal: AiMeal;
  saved: boolean;
  onToggleSave?: () => void;
  onDelete?: () => void;
  /** Owner-only extras rendered under the recipe toggle (e.g. cook logs). */
  footer?: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <SurfaceCard className="border-l-4 border-l-primary">
      <div className="flex items-start gap-2.5">
        <IconBubble emoji={meal.emoji || "🍽️"} tone="gold" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-display text-[17px] leading-tight text-foreground break-words">
                {meal.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {meal.cuisine && (
                  <span className="px-2 py-[2px] rounded-full bg-primary/10 text-primary text-[10px] uppercase tracking-[0.14em] font-semibold">
                    {meal.cuisine}
                  </span>
                )}
                {typeof meal.time_minutes === "number" && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-body text-muted-foreground">
                    <Clock className="size-3" /> {meal.time_minutes} min
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onToggleSave && (
                <button
                  type="button"
                  onClick={saved ? undefined : onToggleSave}
                  disabled={saved}
                  aria-label={saved ? "Saved to your meals" : "Save meal"}
                  className={`inline-flex shrink-0 items-center gap-1 h-8 px-2.5 rounded-pill text-[10px] font-semibold uppercase tracking-[0.12em] whitespace-nowrap transition ${
                    saved
                      ? "bg-primary/10 text-primary cursor-default"
                      : "text-muted-foreground hover:bg-primary/10"
                  }`}
                >
                  <Heart className={`size-3.5 shrink-0 ${saved ? "fill-primary text-primary" : ""}`} />
                  <span className="whitespace-nowrap">{saved ? "Saved" : "Save"}</span>
                </button>
              )}

              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  aria-label="Delete saved meal"
                  className="size-8 rounded-full flex items-center justify-center hover:bg-destructive/10 transition text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div>
          {meal.summary && (
            <p className="mt-2 text-xs text-foreground/85 font-body leading-relaxed">
              {meal.summary}
            </p>
          )}
          {meal.targets && meal.targets.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {meal.targets.map((t) => (
                <span
                  key={t}
                  className="px-2 py-[2px] rounded-full bg-good/15 text-good text-[10px] font-medium font-body"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary"
          >
            {open ? "Hide recipe" : "View recipe"}
            <ChevronDown
              className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
          {open && (
            <div className="mt-3 space-y-3 rounded-[12px] bg-secondary/40 border-t-2 border-primary/25 p-3">
              {meal.ingredients && meal.ingredients.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                    Ingredients
                  </p>
                  <ul className="space-y-1">
                    {meal.ingredients.map((ing, i) => (
                      <li key={i} className="text-xs font-body text-foreground/85 leading-relaxed pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-primary">
                        {ing}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {meal.steps && meal.steps.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                    Method
                  </p>
                  <ol className="space-y-1.5">
                    {meal.steps.map((s, i) => (
                      <li key={i} className="text-xs font-body text-foreground/85 leading-relaxed flex gap-2">
                        <span className="shrink-0 size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
          {footer}
      </div>
    </SurfaceCard>
  );
};

/**
 * Support-level quantity rule for supplements.
 * L1 — high priority only. L2 — high + medium. L3/L4 — everything.
 */
const filterSupplementsByLevel = (
  list: AiSupplement[],
  level: TipsLevel,
): AiSupplement[] => {
  const rank = (s: AiSupplement) =>
    s.priority === "high" ? 3 : s.priority === "low" ? 1 : 2;
  const sorted = [...list].sort((a, b) => rank(b) - rank(a));
  if (level === 1) {
    const high = sorted.filter((s) => rank(s) === 3);
    return high.length > 0 ? high : sorted.slice(0, 1);
  }
  if (level === 2) return sorted.filter((s) => rank(s) >= 2);
  return sorted;
};

// ── Deterministic fallback supplements (only used if AI omits them) ─────


const buildFallbackSupplements = (p: Profile): AiSupplement[] => {
  // No animal-derived suggestion unless we know it is acceptable.
  const noAnimal = suppressesAnimalFoods(p.diet) && !p.dietOther.trim();
  const plantB12 = p.diet === "vegan" || p.diet === "vegetarian" || noAnimal;
  const out: AiSupplement[] = [];
  if (p.flagged.has("Ferritin")) out.push({
    emoji: "🩸", name: "Iron", dose: "One 200 mg tablet with orange juice", priority: "high",
    body: "**Why it matters:** Ferritin (your body's stored iron) is what your follicles draw on to build new hair, so when it runs low you tend to see more shedding.\n\n**How to use it:** Take it with vitamin C to help absorption.\n\n**Watch out for:** Keep it away from tea, coffee and calcium for an hour either side.",
  });
  if (p.flagged.has("Vitamin D")) out.push({
    emoji: "☀️", name: "Vitamin D3", dose: "1000–2000 IU daily with breakfast", priority: "high",
    body: "**Why it matters:** Vitamin D helps switch your follicles back into their growth phase and supports scalp health.\n\n**How to use it:** Take it daily with breakfast or another meal that contains some fat, because vitamin D absorbs better that way.\n\n**Watch out for:** If you already take a high-dose vitamin D prescription, check your dose before adding another supplement.",
  });
  if (p.flagged.has("Vitamin B12") || plantB12) out.push({
    emoji: "🌱", name: "Vitamin B12", dose: "Methylcobalamin 1000 mcg daily", priority: "high",
    body: "**Why it matters:** B12 is what your blood cells use to carry oxygen to every follicle.\n\n**How to use it:** Take a small daily supplement consistently, especially if you eat little or no animal food.\n\n**Watch out for:** If you take metformin or long-term reflux medication, B12 can run low more easily, so it is worth tracking.",
  });
  if (p.flagged.has("Zinc")) out.push({
    emoji: "⚙️", name: "Zinc", dose: "8–11 mg daily (never above 40 mg)", priority: "medium",
    body: "**Why it matters:** Zinc helps your follicles build the proteins that make up each strand and keeps scalp oil in balance.\n\n**How to use it:** Keep the dose modest and take it with food if it makes you feel nauseous.\n\n**Watch out for:** Going too high can work against you, so avoid stacking multiple zinc supplements.",
  });
  const omegaPaired =
    p.diet === "vegan" || noAnimal
      ? "Flaxseed, chia, walnuts, hemp seeds and seaweed."
      : p.diet === "vegetarian"
        ? "Flaxseed, chia, walnuts, hemp seeds and eggs."
        : "Sardines, mackerel, salmon, eggs, pumpkin seeds and walnuts.";
  out.push({
    emoji: p.diet === "pescatarian" || p.diet === "omnivore" ? "🐟" : "🌿",
    name: "Omega-3",
    dose:
      p.diet === "pescatarian" || p.diet === "omnivore"
        ? "1000 mg fish oil daily"
        : "1000 mg algae oil daily",
    priority: "medium",
    body: `**Why it matters:** Omega-3s help calm inflammation around the follicle and keep your scalp's oil layer supple, which supports flexible strands.\n\n**How to use it:** Take it with a main meal that already contains fat so your body absorbs it well.\n\n**Best paired with:** ${omegaPaired}\n\n**Watch out for:** If you take blood-thinning medication or have surgery planned, check with your GP before starting.`,
  });
  return out;
};

/** The plan already stored for this member, if it is complete enough to show. */
async function loadStoredPlan(
  userId: string,
): Promise<{ plan: AiPlan; generatedAt: string | null } | null> {
  const { data } = await supabase
    .from("ai_summaries")
    .select("payload, updated_at")
    .eq("user_id", userId)
    .eq("kind", "nutrition_plan")
    .maybeSingle();
  const payload = (data?.payload ?? null) as (AiPlan & { _generated_at?: string }) | null;
  if (!payload) return null;
  const complete =
    !!payload.summary &&
    Array.isArray(payload.diet) &&
    payload.diet.length > 0 &&
    Array.isArray(payload.avoid) &&
    payload.avoid.length > 0;
  if (!complete) return null;
  return { plan: payload, generatedAt: payload._generated_at ?? data?.updated_at ?? null };
}

/** True when a blood panel or result was added or edited after `since`. */
async function bloodTouchedSince(userId: string, since: string | null): Promise<boolean> {
  if (!since) return true;
  const [{ data: panels }, { data: results }] = await Promise.all([
    supabase
      .from("blood_panels")
      .select("updated_at")
      .eq("user_id", userId)
      .gt("updated_at", since)
      .limit(1),
    supabase
      .from("blood_results")
      .select("updated_at")
      .eq("user_id", userId)
      .gt("updated_at", since)
      .limit(1),
  ]);
  return (panels?.length ?? 0) > 0 || (results?.length ?? 0) > 0;
}
/**
 * The meal ideas already stored for this member.
 *
 * PERMANENT STORAGE (2026-08-28). `meal-ideas` writes every good batch to
 * `ai_summaries` (kind = "meal_ideas"), but the screen never read it back, so
 * every visit to the Meals tab fired a fresh generation and sat on a progress
 * bar. Meals are now read straight from storage and rendered instantly; a new
 * batch is only ever written on an explicit request or after a real blood
 * change. Viewing never spends a token.
 */
async function loadStoredMeals(
  userId: string,
): Promise<{ meals: AiMeal[]; generatedAt: string | null } | null> {
  const { data } = await supabase
    .from("ai_summaries")
    .select("payload, updated_at")
    .eq("user_id", userId)
    .eq("kind", "meal_ideas")
    .maybeSingle();
  const payload = (data?.payload ?? null) as
    | { meals?: AiMeal[]; _generated_at?: string }
    | null;
  const meals = Array.isArray(payload?.meals) ? (payload!.meals as AiMeal[]) : [];
  if (meals.length === 0) return null;
  return { meals, generatedAt: payload?._generated_at ?? data?.updated_at ?? null };
}

const NutritionPlan = () => {


  const navigate = useNavigate();
  const isOnboarding = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("onboarding") === "1";
  const { level } = useNutritionLevel();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sensitivitySheet, setSensitivitySheet] = useState(false);
  const { open: sensitivityAsk, close: dismissSensitivityAsk } = useSensitivityCapture("dietary");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  /**
   * A warranted regeneration running BEHIND the stored plan. The existing plan
   * stays on screen and readable; this only drives a small "Updating" chip.
   * Never a blocking spinner, never an empty page.
   */
  const [refreshing, setRefreshing] = useState(false);
  const inputsFpRef = useRef<string | null>(null);
  /** Real profile-completeness signals, so a request failure is never
   *  misreported to the member as "your profile is incomplete". */
  const [hasBloodPanel, setHasBloodPanel] = useState<boolean | null>(null);
  const [hasHealthProfile, setHasHealthProfile] = useState<boolean | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [profile, setProfile] = useState<Profile>({
    diet: "unknown",
    dietOther: "",
    alcohol: "unknown",
    flagged: new Set(),
  });
  const [plan, setPlan] = useState<AiPlan | null>(null);
  const [planFailed, setPlanFailed] = useState(false);
  const [meals, setMeals] = useState<AiMeal[] | null>(null);
  const [mealsLoading, setMealsLoading] = useState(false);
  /** Real, moving progress for the only case that generates: an explicit ask. */
  const [mealsProgress, setMealsProgress] = useState(0);
  const mealsInFlightRef = useRef(false);
  const [mealsView, setMealsView] = useState<"ideas" | "saved">("ideas");

  const savedMealsQ = useSavedMeals();

  const savedByKey = useMemo(() => {
    const set = new Set<string>();
    (savedMealsQ.data ?? []).forEach((m) => set.add(mealKey(m.name)));
    return set;
  }, [savedMealsQ.data]);

  const fetchMeals = async (
    currentProfile = profile,
    opts: { background?: boolean } = {},
  ) => {
    if (mealsInFlightRef.current) return;
    mealsInFlightRef.current = true;
    // A background refresh keeps the stored meals on screen; only a first run
    // or an explicit "Generate new ideas" shows the progress bar.
    if (!opts.background) setMealsLoading(true);
    setMealsProgress(0);
    const start = Date.now();
    const ticker = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const target = Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / 8))));
      setMealsProgress((p) => (target > p ? target : Math.min(95, p + 1)));
    }, 200);

    try {
      const context = await buildAiContext();
      // Saved meals are permanently off the menu until she deletes them.
      const savedNames = (savedMealsQ.data ?? [])
        .map((m) => (m.name ?? "").trim())
        .filter(Boolean);
      // Send what she has already seen or saved so "Generate new ideas"
      // returns a genuinely different batch instead of the same six meals.
      const exclude = Array.from(
        new Set(
          [
            ...(meals ?? []).map((m) => m.name),
            ...savedNames,
          ]
            .map((n) => (n ?? "").trim())
            .filter(Boolean),
        ),
      );
      const { data, error } = await aiInvoke<{ meals?: AiMeal[] }>("meal-ideas", {
        context,
        savedMeals: savedNames,
        diet: currentProfile.diet,
        dietOther: currentProfile.dietOther,
        alcohol: currentProfile.alcohol,
        flaggedMarkers: Array.from(currentProfile.flagged),
        exclude,
      });
      if (error) {
        const msg = (error as { message?: string }).message ?? "Couldn't generate meals";
        if (msg.includes("429")) toast.error("Try again in a moment.");
        else if (msg.includes("402")) toast.error("AI credits needed.");
        else if (isAuthInvokeError(error)) toast.error("Your session timed out — pull down to refresh and try again.");
        else toast.error(msg);
        return;
      }

      if (Array.isArray(data?.meals) && data.meals.length > 0) {
        // Belt and braces: never render something she has already saved, even
        // if the model slips and returns it anyway.
        const savedKeys = new Set(savedNames.map(mealKey));
        const fresh = (data.meals as AiMeal[]).filter((m) => !savedKeys.has(mealKey(m.name)));
        if (fresh.length > 0) {
          setMeals(fresh);
          // Stored batch is current for this input set — the next visit reads it.
          if (user && inputsFpRef.current) {
            writeConfirmedFingerprint(user.id, "meals", inputsFpRef.current);
          }
        } else toast.error("No new meal ideas came back — try again.");
      } else {
        toast.error("No new meal ideas came back — try again.");
      }
    } catch (e) {
      console.error("meal-ideas invoke failed", e);
      toast.error("Couldn't generate meal ideas.");
    } finally {
      clearInterval(ticker);
      setMealsProgress(100);
      mealsInFlightRef.current = false;
      setMealsLoading(false);
    }

  };

  const handleSaveMeal = async (meal: AiMeal) => {
    // Already saved? Nothing to do — the card shows its saved state instead.
    if (savedByKey.has(mealKey(meal.name))) return;
    const draft: MealDraft = {
      name: meal.name,
      emoji: meal.emoji ?? null,
      cuisine: meal.cuisine ?? null,
      time_minutes: meal.time_minutes ?? null,
      summary: meal.summary ?? null,
      targets: meal.targets ?? [],
      ingredients: meal.ingredients ?? [],
      steps: meal.steps ?? [],
    };
    await savedMealsQ.save.mutateAsync(draft);
    toast.success("Saved to your meals");
  };

  const handleDeleteSaved = async (m: SavedMeal) => {
    await savedMealsQ.remove.mutateAsync(m.id);
    toast.success("Deleted");
  };

  const startProgress = () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setAiProgress(0);
    const start = Date.now();
    progressTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const target = Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / 8))));
      setAiProgress((p) => (target > p ? target : Math.min(95, p + 1)));
    }, 200);
  };

  const stopProgress = (final: number) => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setAiProgress(final);
  };

  /**
   * SPEND CONTROL (2026-08-26). This surface used to fire up to three writer
   * calls per view: a mount call, plus retries whenever the response lacked
   * supplements. With the old volatile cache signature every one of those was a
   * cold generation — 17 calls / 380k tokens in eleven minutes for one member.
   *
   * Now: one request per view at most, collapsed through an in-flight ref, and
   * `force` is set ONLY from the explicit "Generate a new plan" control. A
   * failure surfaces a "Try again" button instead of silently re-spending.
   */
  const inFlightRef = useRef(false);


  const fetchPlan = async (
    force = false,
    currentProfile = profile,
    opts: { background?: boolean } = {},
  ) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (opts.background) {
      setRefreshing(true);
    } else {
      setAiLoading(true);
      startProgress();
    }
    try {
      const context = await buildAiContext();
      const { data, error } = await aiInvoke<Record<string, unknown>>("nutrition-plan", {
        force,
        context,
        diet: currentProfile.diet,
        dietOther: currentProfile.dietOther,
        alcohol: currentProfile.alcohol,
        flaggedMarkers: Array.from(currentProfile.flagged),
      });
      if (error) {
        const msg = (error instanceof Error ? error.message : String(error)) || "Couldn't generate plan";
        if (msg.includes("429")) toast.error("Try again in a moment.");
        else if (msg.includes("402")) toast.error("AI credits needed.");
        else toast.error(msg);
        setPlanFailed(true);
        stopProgress(0);
        return;
      }
      const nextPlan = data?.plan as AiPlan | undefined;
      const hasSupplements = Array.isArray(nextPlan?.supplements) && nextPlan.supplements.length > 0;
      if (nextPlan) setPlan(nextPlan);
      setPlanFailed(!hasSupplements);
      // The stored plan is now current for this input set, so the next visit is
      // a pure read even when the server answered from its own cache.
      if (nextPlan && user && inputsFpRef.current) {
        writeConfirmedFingerprint(user.id, "plan", inputsFpRef.current);
      }
      stopProgress(100);
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      console.error("nutrition-plan invoke failed", e);
      toast.error("Couldn't generate your plan.");
      setPlanFailed(true);
      stopProgress(0);
    } finally {
      inFlightRef.current = false;
      setAiLoading(false);
      setRefreshing(false);
    }
  };


  useEffect(() => () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
  }, []);


  /**
   * ROOT-CAUSE FIX (2026-08-15). This effect used to run once on mount and read
   * the member via `supabase.auth.getUser()`. On a cold load the session is
   * still hydrating, so `user` came back null: the blood query was skipped
   * (empty `flagged`, no "anchored to your markers" block) AND the plan request
   * went out unauthenticated (401 → `plan` stays null → generic fallback
   * supplements and an empty diet/avoid tab). One failure, three symptoms.
   *
   * It now waits for the authenticated user from `useAuth` and re-runs if the
   * session arrives late. Blood data comes from the single canonical reader so
   * this screen, Home and `buildAiContext` cannot disagree, and a marker counts
   * as flagged when it is LOW **or** HIGH.
   */
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const blood = await readBloodData(user.id);
        const flagged = new Set<string>(blood.flagged);
        const clinical = await loadClinicalContext();
        const diet = canonDiet(clinical.health?.diet);
        const dietOther = clinical.health?.dietOther ?? "";
        const alcohol = ((clinical.health?.alcohol ?? "") as Alcohol) || "unknown";
        if (cancelled) return;
        const bloodOnFile = blood.results.length > 0;
        setHasBloodPanel(bloodOnFile);
        setHasHealthProfile(!!clinical.health);
        const next = { diet, dietOther, alcohol, flagged };
        setProfile(next);
        // No bloods on file: this screen renders its locked state, so there is
        // nothing to generate. Blood work is optional; adding it later opens it.
        //
        // VIEWING NEVER SPENDS A TOKEN (2026-08-27). The stored plan is read
        // straight from `ai_summaries` and rendered instantly. The edge function
        // is only invoked when there is no stored plan, or when her blood data
        // has actually been touched since that plan was written. Every other
        // visit — a back-navigation, a tab switch, a reload — is a pure read.
        if (bloodOnFile) {
          const stored = await loadStoredPlan(user.id);
          if (cancelled) return;
          if (stored?.plan) {
            setPlan(stored.plan);
            setPlanFailed(
              !Array.isArray(stored.plan.supplements) || stored.plan.supplements.length === 0,
            );
          }
          const storedMeals = await loadStoredMeals(user.id);
          if (cancelled) return;
          if (storedMeals) setMeals(storedMeals.meals);

          // Stored content is on screen now — stop the page-level wait before
          // doing anything else.
          setLoading(false);

          // WHAT COUNTS AS A CHANGE (2026-09-05). Blood results, supplements,
          // hair profile, goal/challenges/concerns and the health & diet
          // answers. Compared against the fingerprint the stored plan was last
          // confirmed against, so a cache hit does not leave the check failing
          // for ever. When nothing moved, this visit is a pure read.
          const inputs = await readNutritionInputs(user.id);
          if (cancelled) return;
          inputsFpRef.current = inputs.fingerprint;
          const confirmedPlan = readConfirmedFingerprint(user.id, "plan");
          const confirmedMeals = readConfirmedFingerprint(user.id, "meals");

          if (!stored?.plan) {
            // First plan for this member: the only case that shows the honest
            // generation progress, because there is nothing to read.
            void fetchPlan(false, next);
          } else if (confirmedPlan !== inputs.fingerprint) {
            // Something she changed genuinely affects the plan — refresh it
            // behind the plan already on screen.
            void fetchPlan(false, next, { background: true });
          }

          if (storedMeals && confirmedMeals !== inputs.fingerprint) {
            void fetchMeals(next, { background: true });
          }
        }

      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);


  if (loading) {
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Nutrition Plan" tips />
        <div className="px-5 pt-10 space-y-3">
          <p className="font-body text-[13px] text-foreground/80">
            Building your nutrition plan
          </p>
          {/* nutrition-plan runs three model passes; summed per generation the
              measured wall clock is p50 129.9s / p75 136.7s / p90 141.1s. */}
          <AiProgressBar
            expectedMs={135000}
            overrunNote="Still working — your plan is written in a few passes, so this one takes a minute or two."
            stages={[
              "Reading your health profile",
              "Checking your blood markers against the ranges",
              "Honouring your dietary pattern",
              "Choosing the foods that fit",
              "Writing your meals and food list",
              "Checking every claim against the manuscript",
            ]}
          />
        </div>
      </ScreenLayout>
    );

  }

  /**
   * LOCKED STATE — no blood work on file.
   *
   * Blood work is optional, so this is a lock and an open door, never an error
   * or an empty page. Supplements stay available: they are not derived from
   * blood values. Blood history and trends keep their own "not enough data"
   * state elsewhere — no second lock is added there.
   */
  if (hasBloodPanel === false) {
    return (
      <ScreenLayout bottomNav={!isOnboarding}>
        <TitleBar title="Nutrition Plan" tips onBack={smartBack(navigate, isOnboarding ? "/onboarding/blood-ai-summary" : "/home")} />
        <div className="px-5 pt-1 pb-8 space-y-4">
          <SurfaceCard tone="gold" className="space-y-3">
            <OptionalBadge />
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-primary" aria-hidden="true">
                <Lock className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-[16px] leading-tight">
                  Locked until you add your bloods
                </p>
                <p className="text-[12.5px] font-body text-foreground/80 leading-relaxed mt-1">
                  You don't need blood work to use STRAND. It only opens this diet and
                  nutrition section, which reads your iron, ferritin, vitamin D, B12 and
                  thyroid values and won't run on estimates.
                </p>
              </div>
            </div>
            <Button
              variant="gold"
              size="pill"
              className="w-full whitespace-normal break-words leading-tight"
              onClick={() => navigate("/blood-upload")}
            >
              Add my blood results →
            </Button>
            <p className="text-[11.5px] font-body text-muted-foreground leading-relaxed">
              Add your results whenever you're ready — nothing you've entered expires.
            </p>
          </SurfaceCard>

          <div className="pt-1 border-t border-border/70" />
          <MySupplementsSection />
        </div>
      </ScreenLayout>
    );
  }

  // Supplements — prefer AI (personalised, layman's terms); fall back to
  // deterministic list only if AI didn't return them. When the fallback is
  // used, every card says so — generic guidance is never presented as if it
  // were personalised.
  const usingFallbackSupplements = !(plan?.supplements && plan.supplements.length > 0);
  const supplements: AiSupplement[] = filterSupplementsByLevel(
    usingFallbackSupplements ? buildFallbackSupplements(profile) : plan!.supplements!,
    level,
  );


  const renderLoading = (label: string, pctOverride?: number) => {
    const pct = Math.min(100, Math.max(0, Math.round(pctOverride ?? aiProgress)));

    return (
      <div className="px-2 pt-6 pb-4 flex flex-col items-center text-center">
        <p className="font-display text-[20px] leading-tight text-foreground mb-5">{label}</p>
        <div
          className="text-[40px] font-display text-primary tabular-nums mb-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          {pct}%
        </div>
        <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground font-body mt-4 leading-relaxed">
          STRAND is tailoring your nutrition guidance to your bloods, hair and heritage profile.
        </p>
      </div>
    );
  };

  const renderAiSection = (
    cards: AiCard[] | undefined,
    kind: "diet" | "avoid",
  ) => {
    if (aiLoading && !cards) {
      return renderLoading("Personalising your plan…");
    }
    const shown = limitSupporting(cards, level);
    if (shown.length === 0) {
      if (level === 1) {
        return (
          <SurfaceCard tone="gold">
            <p className="text-xs font-body leading-relaxed">
              Kept simple at level 1 — focus on your supplements. Turn up your guidance level for {kind === "diet" ? "diet ideas" : "what to avoid"}.
            </p>
          </SurfaceCard>
        );
      }
      // THREE DISTINCT STATES. A failed request must never be reported to the
      // member as her data being incomplete.
      const missing: Array<{ label: string; to: string }> = [];
      if (hasHealthProfile === false) missing.push({ label: "your health and diet answers", to: "/onboarding/profile-step-2" });
      // No blood-panel branch here: a member with no bloods never reaches this
      // point — the whole screen renders its locked state above instead.


      if (missing.length > 0) {
        return (
          <SurfaceCard tone="gold">
            <p className="text-xs font-body leading-[1.6]">
              To build this section STRAND still needs {missing.map((m) => m.label).join(" and ")}.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {missing.map((m) => (
                <button
                  key={m.to}
                  type="button"
                  onClick={() => navigate(m.to)}
                  className="w-full px-4 py-2 rounded-pill bg-primary text-primary-foreground text-[12px] font-semibold"
                >
                  Add {m.label}
                </button>
              ))}
            </div>
          </SurfaceCard>
        );
      }

      return (
        <SurfaceCard tone="gold">
          <p className="text-xs font-body leading-[1.6]">
            We couldn't generate this part of your plan just now. Your profile and
            blood work are fine — this was a problem on our side.
          </p>
          <button
            type="button"
            onClick={() => void fetchPlan(true, profile)}
            className="mt-3 w-full px-4 py-2 rounded-pill bg-primary text-primary-foreground text-[12px] font-semibold"
          >
            Try again
          </button>
        </SurfaceCard>
      );

    }
    return shown.map((c, i) =>
      kind === "diet" ? (
        <DietCard key={`${c.name}-${i}`} c={c} />
      ) : (
        <AvoidCard key={`${c.name}-${i}`} c={c} />
      ),
    );
  };

  const flaggedList = Array.from(profile.flagged);

  return (
    <ScreenLayout bottomNav={!isOnboarding}>
      <TitleBar title="Nutrition Plan" tips onBack={smartBack(navigate, isOnboarding ? "/onboarding/blood-ai-summary" : "/home")} />
      <div className="px-5 pt-1 pb-8">
        <div className="text-center mb-5">
          <h1 className="font-display text-[26px] leading-tight">Your Nutrition Plan</h1>
          <p className="text-xs text-muted-foreground font-body mt-2 max-w-[300px] mx-auto">
            Personalised to your blood work, heritage, life stage and hair goals.
          </p>
        </div>

        <div className="mb-4 rounded-[12px] bg-muted/60 border border-border/60 px-3 py-2">
          <div className="flex items-start gap-2">
            <Info className="size-3.5 text-muted-foreground shrink-0 mt-[1px]" />
            <p className="text-[11px] font-body leading-snug text-muted-foreground">
              <strong className="font-semibold text-foreground/80">Not medical advice.</strong> Always check with your GP before starting a new supplement — especially if you're pregnant, breastfeeding, on medication, or managing a health condition.
            </p>
          </div>
        </div>

        {/* The ONLY path that spends tokens on this screen. Viewing, navigating
            back, or re-rendering always reads the stored plan. */}
        {/* A warranted refresh runs behind the plan she is already reading. */}
        {refreshing && (
          <div className="mb-4 flex justify-center">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-pill bg-secondary text-[11px] font-body text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              Updating your plan with your latest details
            </span>
          </div>
        )}

        {plan && !aiLoading && !refreshing && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={() => void fetchPlan(true, profile)}
              className="px-4 py-2 rounded-pill border border-border bg-background text-[11px] font-body font-semibold tracking-wide uppercase"
            >
              Generate a new plan
            </button>
          </div>
        )}

        <div className="mb-4 space-y-2">
          {sensitivityAsk && (
            <SensitivityCaptureCard
              scope="dietary"
              onOpen={() => {
                dismissSensitivityAsk();
                setSensitivitySheet(true);
              }}
              onLater={() => dismissSensitivityAsk()}
            />
          )}
          <AvoidingSummary scope="dietary" onEdit={() => setSensitivitySheet(true)} />
          <NutrientGapNote />
        </div>
        <SensitivitySheet
          scope="dietary"
          open={sensitivitySheet}
          onOpenChange={setSensitivitySheet}
        />

        {hasRenderableAiText(plan?.summary) && (
          <div className="mb-4 rounded-[14px] bg-gradient-to-br from-primary/15 via-primary/8 to-transparent border border-primary/20 p-4">
            <div className="flex items-start gap-2 mb-2">
              <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Sparkles className="size-3.5 text-primary" />
              </div>
              <p className="card-title font-display text-[14.5px] leading-tight text-foreground pt-1">Why this plan</p>
            </div>
            <AiProse text={plan.summary} />
          </div>
        )}

        {flaggedList.length > 0 && (
          <div className="mb-4 rounded-[14px] bg-warn/10 border border-warn/25 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Info className="size-3.5 text-warn" />
              <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-warn">
                Anchored to your flagged markers
              </p>
            </div>
            <KeyFactChips
              facts={flaggedList.map((m) => ({ label: m, icon: Stethoscope, tone: "warning" as const }))}
              tone="warning"
            />
          </div>
        )}

        {/* Opening the Meals tab NEVER generates. Stored meals are already
            hydrated on mount; with nothing stored she gets an explicit
            "Generate meal ideas" button instead of an automatic spend. */}
        <Tabs defaultValue="supplements">

          <TabsList className="grid w-full grid-cols-4 bg-secondary gap-0.5 p-0.5">
            <TabsTrigger value="supplements" className="gap-1 px-1 text-[11px]">
              <Pill className="size-3" /> Supps
            </TabsTrigger>
            <TabsTrigger value="diet" className="gap-1 px-1 text-[11px]">
              <Leaf className="size-3" /> Diet
            </TabsTrigger>
            <TabsTrigger value="avoid" className="gap-1 px-1 text-[11px]">
              <Ban className="size-3" /> Avoid
            </TabsTrigger>
            <TabsTrigger value="meals" className="gap-1 px-1 text-[11px]">
              <ChefHat className="size-3" /> Meals
            </TabsTrigger>
          </TabsList>

          <TabsContent value="supplements" className="space-y-3 mt-4">
            <MySupplementsSection />

            <div className="pt-1 border-t border-border/70" />
            <SectionHeading>STRAND recommends</SectionHeading>

            {/* The deterministic food-first starting points render IMMEDIATELY,
                even while the AI plan is still generating. A new member with no
                bloods and no profile must never sit in front of a bare progress
                bar for a minute as her first real content. The personalised
                version replaces these cards in place when it arrives. */}
            <>
              {aiLoading && usingFallbackSupplements && (
                <SurfaceCard tone="gold">
                  <p className="text-xs font-body leading-[1.65]">
                    General starting points below while STRAND builds your personalised
                    plan — it will replace these as soon as it's ready.
                  </p>
                  <div className="mt-2.5 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-primary transition-[width] duration-300 ease-out"
                      style={{ width: `${Math.min(100, Math.max(0, Math.round(aiProgress)))}%` }}
                    />
                  </div>
                </SurfaceCard>
              )}
              {usingFallbackSupplements && planFailed && (
                <SurfaceCard tone="gold">
                  <p className="text-xs font-body leading-[1.65]">
                    We couldn't finish your personalised plan just now, so these are general
                    starting points rather than guidance built from your profile.
                  </p>
                  <button
                    type="button"
                    onClick={() => void fetchPlan(false, profile)}
                    className="mt-3 px-4 py-2 rounded-pill bg-primary text-primary-foreground text-[12px] font-semibold"
                  >
                    Try again
                  </button>
                </SurfaceCard>
              )}
              {supplements.map((s, i) => (
                <SupplementCard
                  key={`${s.name}-${i}`}
                  s={s}
                  isFallback={usingFallbackSupplements}
                />
              ))}
            </>

            <SourceNote>
              {usingFallbackSupplements
                ? "General guidance from How To Love Your Afro by Paige Lewin — not yet personalised to your profile."
                : (
                  <>
                    Personalised by STRAND AI from your bloods, heritage and health profile, grounded in <em>How To Love Your Afro</em> by Paige Lewin.
                  </>
                )}
            </SourceNote>

          </TabsContent>

          <TabsContent value="diet" className="space-y-3 mt-4">
            {renderAiSection(plan?.diet, "diet")}
            <SourceNote>
              Personalised by STRAND AI from your full profile, grounded in <em>How To Love Your Afro</em> by Paige Lewin.
            </SourceNote>
          </TabsContent>

          <TabsContent value="avoid" className="space-y-3 mt-4">
            {renderAiSection(plan?.avoid, "avoid")}
            <SourceNote>
              Personalised by STRAND AI from your full profile, grounded in <em>How To Love Your Afro</em> by Paige Lewin.
            </SourceNote>
          </TabsContent>

          <TabsContent value="meals" className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-1.5 p-0.5 bg-secondary rounded-[12px]">
              <button
                type="button"
                onClick={() => setMealsView("ideas")}
                className={`py-2 rounded-[10px] text-[12px] font-semibold transition ${
                  mealsView === "ideas"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                Meal Ideas
              </button>
              <button
                type="button"
                onClick={() => setMealsView("saved")}
                className={`py-2 rounded-[10px] text-[12px] font-semibold transition inline-flex items-center justify-center gap-1.5 ${
                  mealsView === "saved"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                <Heart className="size-3" /> Saved
                {(savedMealsQ.data?.length ?? 0) > 0 && (
                  <span className="text-[10px] px-1.5 rounded-full bg-primary text-primary-foreground">
                    {savedMealsQ.data?.length}
                  </span>
                )}
              </button>
            </div>

            {mealsView === "ideas" ? (
              <>
                {mealsLoading && !meals ? (
                  renderLoading("Cooking up your meal ideas…", mealsProgress)

                ) : meals && limitSupporting(meals, level).length > 0 ? (
                  <>
                    {limitSupporting(meals, level).map((m, i) => (
                      <MealCard
                        key={`${m.name}-${i}`}
                        meal={m}
                        saved={savedByKey.has(mealKey(m.name))}
                        onToggleSave={() => void handleSaveMeal(m)}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => void fetchMeals()}
                      disabled={mealsLoading}
                      className="w-full py-2.5 rounded-pill bg-secondary text-foreground text-[12px] font-semibold hover:bg-secondary/80 transition disabled:opacity-50"
                    >
                      {mealsLoading ? "Finding new ideas…" : "Generate new ideas"}
                    </button>
                  </>
                ) : (
                  <SurfaceCard tone="gold">
                    <p className="text-xs font-body leading-relaxed">
                      Your personalised meal ideas will appear here.
                    </p>
                    <button
                      type="button"
                      onClick={() => void fetchMeals()}
                      className="mt-3 px-4 py-2 rounded-pill bg-primary text-primary-foreground text-[12px] font-semibold"
                    >
                      Generate meal ideas
                    </button>
                  </SurfaceCard>
                )}
                <SourceNote>
                  Personalised by STRAND AI from your bloods, heritage and hair goals, grounded in <em>How To Love Your Afro</em> by Paige Lewin.
                </SourceNote>
              </>
            ) : (
              <>
                {(savedMealsQ.data ?? []).length === 0 ? (
                  <SurfaceCard tone="gold">
                    <p className="text-xs font-body leading-relaxed">
                      Tap the heart on any meal idea to save it here for later.
                    </p>
                  </SurfaceCard>
                ) : (
                  (savedMealsQ.data ?? []).map((m) => (
                    <MealCard
                      key={m.id}
                      meal={{
                        emoji: m.emoji ?? "🍽️",
                        name: m.name,
                        cuisine: m.cuisine ?? undefined,
                        time_minutes: m.time_minutes ?? undefined,
                        summary: m.summary ?? undefined,
                        targets: m.targets,
                        ingredients: m.ingredients,
                        steps: m.steps,
                      }}
                      saved
                      onDelete={() => void handleDeleteSaved(m)}
                      footer={<MealLogZone mealId={m.id} mealName={m.name} />}
                    />
                  ))
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {isOnboarding && (
          <div className="pt-6">
            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={() => navigate("/onboarding/photos")}
            >
              Continue to STRAND →
            </Button>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default NutritionPlan;
