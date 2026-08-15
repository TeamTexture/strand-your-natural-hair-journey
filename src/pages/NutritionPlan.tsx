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
import { Pill, Leaf, Ban, Sparkles, Info, ChefHat, Heart, ChevronDown, Clock, Trash2, AlertTriangle } from "lucide-react";
import { capitaliseSentences } from "@/lib/paragraphs";

import { readBloodData } from "@/lib/bloodRead";
import { useAuth } from "@/hooks/useAuth";

import KeyFactChips from "@/components/guidance/KeyFactChips";
import { Stethoscope } from "lucide-react";
import { buildAiContext } from "@/lib/aiContext";
import { aiInvoke } from "@/lib/aiInvoke";
import { loadClinicalContext } from "@/lib/clinicalContext";
import { useSavedMeals, type MealDraft, type SavedMeal } from "@/hooks/useSavedMeals";
import { toast } from "sonner";
import AiProse from "@/components/tips/AiProse";

import { condenseProse, limitSupporting, wantsDetail, wantsWhy } from "@/lib/tipsRender";
import type { TipsLevel } from "@/lib/tipsLevel";
import { smartBack } from "@/lib/smartBack";
import { canonDiet, suppressesAnimalFoods, type DietaryPattern } from "@/lib/dietaryPattern";
import AiProgressBar from "@/components/AiProgressBar";


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
}: {
  meal: AiMeal;
  saved: boolean;
  onToggleSave?: () => void;
  onDelete?: () => void;
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
            <div className="flex items-center gap-1">
              {onToggleSave && (
                <button
                  type="button"
                  onClick={onToggleSave}
                  aria-label={saved ? "Remove from saved meals" : "Save meal"}
                  className="size-8 rounded-full flex items-center justify-center hover:bg-primary/10 transition"
                >
                  <Heart
                    className={`size-4 transition ${
                      saved ? "fill-primary text-primary" : "text-muted-foreground"
                    }`}
                  />
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

const NutritionPlan = () => {
  const navigate = useNavigate();
  const isOnboarding = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("onboarding") === "1";
  const { level } = useNutritionLevel();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
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
  const [mealsView, setMealsView] = useState<"ideas" | "saved">("ideas");
  const savedMealsQ = useSavedMeals();

  const savedByKey = useMemo(() => {
    const set = new Set<string>();
    (savedMealsQ.data ?? []).forEach((m) => set.add(m.name.trim().toLowerCase()));
    return set;
  }, [savedMealsQ.data]);

  const fetchMeals = async (currentProfile = profile) => {
    setMealsLoading(true);
    try {
      const context = await buildAiContext();
      // Send what she has already seen or saved so "Generate new ideas"
      // returns a genuinely different batch instead of the same six meals.
      const exclude = Array.from(
        new Set(
          [
            ...(meals ?? []).map((m) => m.name),
            ...(savedMealsQ.data ?? []).map((m) => m.name),
          ]
            .map((n) => (n ?? "").trim())
            .filter(Boolean),
        ),
      );
      const { data, error } = await supabase.functions.invoke("meal-ideas", {
        body: {
          context,
          diet: currentProfile.diet,
          dietOther: currentProfile.dietOther,
          alcohol: currentProfile.alcohol,
          flaggedMarkers: Array.from(currentProfile.flagged),
          exclude,
        },
      });
      if (error) {
        const msg = error.message ?? "Couldn't generate meals";
        if (msg.includes("429")) toast.error("Try again in a moment.");
        else if (msg.includes("402")) toast.error("AI credits needed.");
        else toast.error(msg);
        return;
      }
      if (Array.isArray(data?.meals) && data.meals.length > 0) {
        setMeals(data.meals as AiMeal[]);
      } else {
        toast.error("No new meal ideas came back — try again.");
      }
    } catch (e) {
      console.error("meal-ideas invoke failed", e);
      toast.error("Couldn't generate meal ideas.");
    } finally {
      setMealsLoading(false);
    }
  };

  const handleSaveMeal = async (meal: AiMeal) => {
    const key = meal.name.trim().toLowerCase();
    const existing = (savedMealsQ.data ?? []).find(
      (m) => m.name.trim().toLowerCase() === key,
    );
    if (existing) {
      await savedMealsQ.remove.mutateAsync(existing.id);
      toast.success("Removed from saved meals");
      return;
    }
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
   * RELIABILITY (2026-08-15). A cold generation takes ~100s server side. If the
   * client's request drops, times out or transiently errors, the plan is
   * nonetheless generated and cached server side — so instead of falling
   * silently back to generic copy, we retry (force=false, which returns the
   * cached plan in <1s once it exists) before giving up.
   */
  const fetchPlan = async (force = false, currentProfile = profile, attempt = 0) => {
    setAiLoading(true);
    startProgress();
    const retry = async () => {
      if (attempt >= 2) return false;
      await new Promise((r) => setTimeout(r, 12000));
      await fetchPlan(false, currentProfile, attempt + 1);
      return true;
    };
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
        if (await retry()) return;
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
      if (!hasSupplements) {
        if (await retry()) return;
        setPlanFailed(true);
      } else {
        setPlanFailed(false);
      }
      stopProgress(100);
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      console.error("nutrition-plan invoke failed", e);
      if (await retry()) return;
      toast.error("Couldn't generate your plan.");
      setPlanFailed(true);
      stopProgress(0);
    } finally {
      setAiLoading(false);
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
        setHasBloodPanel(blood.results.length > 0);
        setHasHealthProfile(!!clinical.health);
        const next = { diet, dietOther, alcohol, flagged };
        setProfile(next);
        void fetchPlan(false, next);
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
          <AiProgressBar
            expectedMs={22000}
            stages={[
              "Reading your health profile",
              "Checking your blood results",
              "Honouring your dietary pattern",
              "Writing your meals and food list",
            ]}
          />
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


  const renderLoading = (label: string) => {
    const pct = Math.min(100, Math.max(0, Math.round(aiProgress)));
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
      return (
        <SurfaceCard tone="gold">
          <p className="text-xs font-body leading-relaxed">
            Your personalised guidance will appear here once your profile is complete.
          </p>
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


        

        {plan?.summary && (
          <div className="mb-4 rounded-[14px] bg-gradient-to-br from-primary/15 via-primary/8 to-transparent border border-primary/20 p-4">
            <div className="flex items-start gap-2 mb-2">
              <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Sparkles className="size-3.5 text-primary" />
              </div>
              <p className="font-display text-[15px] leading-tight text-foreground pt-1">Why this plan</p>
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

        <Tabs defaultValue="supplements" onValueChange={(v) => {
          if (v === "meals" && !meals && !mealsLoading) void fetchMeals();
        }}>
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
            {aiLoading && usingFallbackSupplements ? (
              renderLoading("Personalising your supplements…")
            ) : (
              <>
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
            )}
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
                  renderLoading("Cooking up your meal ideas…")
                ) : meals && limitSupporting(meals, level).length > 0 ? (
                  <>
                    {limitSupporting(meals, level).map((m, i) => (
                      <MealCard
                        key={`${m.name}-${i}`}
                        meal={m}
                        saved={savedByKey.has(m.name.trim().toLowerCase())}
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
