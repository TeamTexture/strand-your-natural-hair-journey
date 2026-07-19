import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingDot from "@/components/LoadingDot";
import { Pill, Leaf, Ban, Sparkles, Info, ChefHat, Heart, ChevronDown, Clock, Trash2 } from "lucide-react";

import { evaluate } from "@/data/bloodRanges";
import { buildAiContext } from "@/lib/aiContext";
import { loadClinicalContext } from "@/lib/clinicalContext";
import { useSavedMeals, type MealDraft, type SavedMeal } from "@/hooks/useSavedMeals";
import { toast } from "sonner";


type Diet = "omnivore" | "vegetarian" | "vegan" | "unknown";
type Alcohol = "none" | "light" | "moderate" | "heavy" | "unknown";

interface Profile {
  diet: Diet;
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

// Render "**bold**" segments and "\n\n" as scannable paragraphs. If the AI
// returned one long block (older cached plans), auto-chunk it into short
// paragraphs of ~2 sentences so it never reads as a wall of text.
const chunkSentences = (text: string, perChunk = 2): string[] => {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g);
  if (!sentences) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += perChunk) {
    chunks.push(sentences.slice(i, i + perChunk).join(" ").trim());
  }
  return chunks.filter(Boolean);
};

// Known "eyebrow" labels the AI uses to introduce a paragraph. When we spot one
// mid-paragraph we split so each becomes its own visually distinct block.
const LABELS = [
  "Your signal",
  "Your focus",
  "Why it matters",
  "Why this matters",
  "How to use",
  "How it helps",
  "Watch for",
  "Best sources",
  "Try this",
  "Note",
];
const LABEL_RE = new RegExp(`\\*{0,2}\\b(${LABELS.join("|")})\\b\\*{0,2}\\s*:\\*{0,2}`, "gi");

const LABEL_TONE: Record<string, { dot: string; label: string }> = {
  "your signal": { dot: "bg-primary", label: "text-primary" },
  "your focus": { dot: "bg-primary", label: "text-primary" },
  "why it matters": { dot: "bg-good", label: "text-good" },
  "why this matters": { dot: "bg-good", label: "text-good" },
  "how to use": { dot: "bg-good", label: "text-good" },
  "how it helps": { dot: "bg-good", label: "text-good" },
  "watch for": { dot: "bg-destructive", label: "text-destructive" },
  "best sources": { dot: "bg-good", label: "text-good" },
  "try this": { dot: "bg-primary", label: "text-primary" },
  note: { dot: "bg-muted-foreground", label: "text-muted-foreground" },
};

const normaliseText = (raw: string): string => {
  let t = String(raw ?? "");
  // Convert literal "\n" sequences and "/n/n" typos into real newlines.
  t = t.replace(/\\n/g, "\n").replace(/\/n\/n/g, "\n\n").replace(/\/n/g, "\n");
  // Strip any bold wrapping around labels, then force each label onto its own paragraph.
  t = t.replace(LABEL_RE, (_m, lbl) => `\n\n${lbl}:`);
  return t.replace(/\n{3,}/g, "\n\n").trim();
};

const RichBody = ({ text, className = "" }: { text: string; className?: string }) => {
  const raw = normaliseText(text);
  let paras = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length <= 1 && raw.length > 220) {
    paras = chunkSentences(raw, 2);
  } else {
    paras = paras.flatMap((p) => (p.length > 260 ? chunkSentences(p, 2) : [p]));
  }
  const renderInline = (line: string, keyPrefix: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        return (
          <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={`${keyPrefix}-t-${i}`}>{part}</span>;
    });
  };
  return (
    <div className={`space-y-3 ${className}`}>
      {paras.map((p, i) => {
        // Detect leading label like "Your signal:" and render as a labelled block.
        const m = p.match(/^([A-Z][A-Za-z ]{2,24}):\s*([\s\S]*)$/);
        const key = m?.[1]?.toLowerCase().trim();
        const tone = key ? LABEL_TONE[key] : undefined;
        if (m && tone) {
          return (
            <div key={i} className="relative pl-3">
              <span className={`absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full ${tone.dot}`} />
              <p className={`text-[10px] uppercase tracking-[0.16em] font-semibold ${tone.label}`}>
                {m[1]}
              </p>
              <p className="mt-1 text-xs text-foreground/85 font-body leading-relaxed">
                {renderInline(m[2], `p${i}`)}
              </p>
            </div>
          );
        }
        return (
          <p key={i} className="text-xs text-foreground/85 font-body leading-relaxed">
            {renderInline(p, `p${i}`)}
          </p>
        );
      })}
    </div>
  );
};

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

const SupplementCard = ({ s }: { s: AiSupplement }) => (
  <SurfaceCard className="border-l-4 border-l-primary">
    <div className="flex gap-3">
      <IconBubble emoji={s.emoji || "💊"} tone="gold" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-[17px] leading-tight text-foreground">{s.name}</p>
          <PriorityChip level={s.priority} />
        </div>
        {s.dose && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1">
            <Pill className="size-3 text-primary" />
            <p className="text-[11px] font-body font-medium text-primary tracking-wide">{s.dose}</p>
          </div>
        )}
        <RichBody text={s.body} className="mt-2" />
      </div>
    </div>
  </SurfaceCard>
);

const DietCard = ({ c }: { c: AiCard }) => (
  <SurfaceCard className="border-l-4 border-l-good">
    <div className="flex gap-3">
      <IconBubble emoji={c.emoji || "🥗"} tone="good" />
      <div className="flex-1 min-w-0">
        <p className="font-display text-[17px] leading-tight text-foreground">{c.name}</p>
        <RichBody text={c.body} className="mt-1.5" />
      </div>
    </div>
  </SurfaceCard>
);

const AvoidCard = ({ c }: { c: AiCard }) => (
  <SurfaceCard className={`border-l-4 ${c.severity === "high" ? "border-l-destructive" : "border-l-warn"}`}>
    <div className="flex gap-3">
      <IconBubble emoji={c.emoji || "⚠️"} tone={c.severity === "high" ? "destructive" : "warn"} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-[17px] leading-tight text-foreground">{c.name}</p>
          <SeverityChip level={c.severity} />
        </div>
        <RichBody text={c.body} className="mt-1.5" />
      </div>
    </div>
  </SurfaceCard>
);

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
      <div className="flex gap-3">
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
      </div>
    </SurfaceCard>
  );
};

// ── Deterministic fallback supplements (only used if AI omits them) ─────

const buildFallbackSupplements = (p: Profile): AiSupplement[] => {
  const isVeg = p.diet === "vegan" || p.diet === "vegetarian";
  const out: AiSupplement[] = [];
  if (p.flagged.has("Ferritin")) out.push({
    emoji: "🩸", name: "Iron", dose: "One 200 mg tablet with orange juice", priority: "high",
    body: "Ferritin (your body's stored iron) is what your follicles draw on to build new hair, so when it runs low you tend to see more shedding. Take it with vitamin C to help absorption, and keep it away from tea, coffee and calcium for an hour either side.",
  });
  if (p.flagged.has("Vitamin D")) out.push({
    emoji: "☀️", name: "Vitamin D3", dose: "1000–2000 IU daily with breakfast", priority: "high",
    body: "Deeper skin tones make less vitamin D from UK sunlight, and vitamin D helps switch your follicles back into their growth phase. A daily dose taken with food (it's fat-soluble) is the simplest way to keep levels steady year-round.",
  });
  if (p.flagged.has("Vitamin B12") || isVeg) out.push({
    emoji: "🌱", name: "Vitamin B12", dose: "Methylcobalamin 1000 mcg daily", priority: "high",
    body: "B12 is what your blood cells use to carry oxygen to every follicle. On a plant-based diet it's the one nutrient you really can't skip — a small daily supplement covers you.",
  });
  if (p.flagged.has("Zinc")) out.push({
    emoji: "⚙️", name: "Zinc", dose: "8–11 mg daily (never above 40 mg)", priority: "medium",
    body: "Zinc helps your follicles build the proteins that make up each strand and keeps scalp oil in balance. A modest daily dose is enough — going higher can actually work against you.",
  });
  out.push({
    emoji: "🐟", name: "Omega-3", dose: "1000 mg fish oil (or algae oil if plant-based) daily", priority: "medium",
    body: "Omega-3s calm inflammation around the follicle and keep your scalp's oil layer supple, which helps hair stay flexible and shiny. Take it with a meal that has some fat in it for best absorption.",
  });
  return out;
};

const NutritionPlan = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [profile, setProfile] = useState<Profile>({
    diet: "unknown",
    alcohol: "unknown",
    flagged: new Set(),
  });
  const [plan, setPlan] = useState<AiPlan | null>(null);
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
      const { data, error } = await supabase.functions.invoke("meal-ideas", {
        body: {
          context,
          diet: currentProfile.diet,
          alcohol: currentProfile.alcohol,
          flaggedMarkers: Array.from(currentProfile.flagged),
        },
      });
      if (error) {
        const msg = error.message ?? "Couldn't generate meals";
        if (msg.includes("429")) toast.error("Try again in a moment.");
        else if (msg.includes("402")) toast.error("AI credits needed.");
        else toast.error(msg);
        return;
      }
      if (Array.isArray(data?.meals)) setMeals(data.meals as AiMeal[]);
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

  const fetchPlan = async (force = false, currentProfile = profile) => {
    setAiLoading(true);
    startProgress();
    try {
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke("nutrition-plan", {
        body: {
          force,
          context,
          diet: currentProfile.diet,
          alcohol: currentProfile.alcohol,
          flaggedMarkers: Array.from(currentProfile.flagged),
        },
      });
      if (error) {
        const msg = error.message ?? "Couldn't generate plan";
        if (msg.includes("429")) toast.error("Try again in a moment.");
        else if (msg.includes("402")) toast.error("AI credits needed.");
        else toast.error(msg);
        stopProgress(0);
        return;
      }
      if (data?.plan) setPlan(data.plan as AiPlan);
      stopProgress(100);
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      console.error("nutrition-plan invoke failed", e);
      toast.error("Couldn't generate your plan.");
      stopProgress(0);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
  }, []);


  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const flagged = new Set<string>();
        if (userData?.user) {
          const { data } = await supabase
            .from("blood_results")
            .select("marker, value")
            .eq("user_id", userData.user.id);
          (data ?? []).forEach((row) => {
            const status = evaluate(row.marker, row.value as number | null);
            if (status === "low") flagged.add(row.marker);
          });
        }
        const clinical = await loadClinicalContext();
        const diet = ((clinical.health?.diet ?? "") as Diet) || "unknown";
        const alcohol = ((clinical.health?.alcohol ?? "") as Alcohol) || "unknown";
        const next = { diet, alcohol, flagged };
        setProfile(next);
        void fetchPlan(false, next);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Nutrition Plan" />
        <LoadingDot label="Loading your plan…" />
      </ScreenLayout>
    );
  }

  // Supplements — prefer AI (personalised, layman's terms); fall back to
  // deterministic list only if AI didn't return them.
  const supplements: AiSupplement[] =
    plan?.supplements && plan.supplements.length > 0
      ? plan.supplements
      : buildFallbackSupplements(profile);

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
    if (!cards || cards.length === 0) {
      return (
        <SurfaceCard tone="gold">
          <p className="text-xs font-body leading-relaxed">
            Your personalised guidance will appear here once your profile is complete.
          </p>
        </SurfaceCard>
      );
    }
    return cards.map((c, i) =>
      kind === "diet" ? (
        <DietCard key={`${c.name}-${i}`} c={c} />
      ) : (
        <AvoidCard key={`${c.name}-${i}`} c={c} />
      ),
    );
  };

  const flaggedList = Array.from(profile.flagged);

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Nutrition Plan" onBack={() => navigate(-1)} />
      <div className="px-5 pt-1 pb-8">
        <h1 className="font-display text-[26px] leading-tight mb-1">Your Nutrition Plan</h1>
        <p className="text-xs text-muted-foreground font-body mb-4">
          Personalised to your blood work, heritage, life stage and hair goals.
        </p>

        {plan?.summary && (
          <div className="mb-4 rounded-[14px] bg-gradient-to-br from-primary/15 via-primary/8 to-transparent border border-primary/20 p-4">
            <div className="flex items-start gap-2 mb-2">
              <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Sparkles className="size-3.5 text-primary" />
              </div>
              <p className="font-display text-[15px] leading-tight text-foreground pt-1">Why this plan</p>
            </div>
            <RichBody text={plan.summary} />
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
            <div className="flex flex-wrap gap-1.5">
              {flaggedList.map((m) => (
                <span
                  key={m}
                  className="px-2 py-0.5 rounded-full bg-warn/20 text-warn text-[11px] font-medium font-body"
                >
                  {m}
                </span>
              ))}
            </div>
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
            {aiLoading && (!plan?.supplements || plan.supplements.length === 0) ? (
              renderLoading("Personalising your supplements…")
            ) : (
              supplements.map((s, i) => <SupplementCard key={`${s.name}-${i}`} s={s} />)
            )}
            <SourceNote>
              Personalised by STRAND AI from your bloods, heritage and health profile, grounded in <em>How To Love Your Afro</em> by Paige Lewin.
            </SourceNote>
            <div className="rounded-[14px] bg-alert-dark/8 border border-alert-dark/15 p-3">
              <p className="text-[11px] font-body leading-relaxed text-foreground/80">
                <strong className="font-semibold">Not medical advice.</strong> Always check with your GP before starting a new supplement — especially if you're pregnant, breastfeeding, on medication, or managing a health condition.
              </p>
            </div>
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
                ) : meals && meals.length > 0 ? (
                  <>
                    {meals.map((m, i) => (
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
                      Generate new ideas
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
      </div>
    </ScreenLayout>
  );
};

export default NutritionPlan;
