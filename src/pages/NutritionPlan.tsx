import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingDot from "@/components/LoadingDot";
import { Pill, Leaf, Ban, Sparkles, Info } from "lucide-react";

import { evaluate } from "@/data/bloodRanges";
import { buildAiContext } from "@/lib/aiContext";
import { loadClinicalContext } from "@/lib/clinicalContext";
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

// Render "**bold**" segments and "\n\n" as scannable paragraphs so long
// bodies read like a note from a friend, not a wall of text.
const RichBody = ({ text, className = "" }: { text: string; className?: string }) => {
  const paras = String(text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
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
    <div className={`space-y-2 ${className}`}>
      {paras.map((p, i) => (
        <p key={i} className="text-xs text-foreground/85 font-body leading-relaxed">
          {renderInline(p, `p${i}`)}
        </p>
      ))}
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

        <Tabs defaultValue="supplements">
          <TabsList className="grid w-full grid-cols-3 bg-secondary">
            <TabsTrigger value="supplements" className="gap-1.5">
              <Pill className="size-3.5" /> Supplements
            </TabsTrigger>
            <TabsTrigger value="diet" className="gap-1.5">
              <Leaf className="size-3.5" /> Diet
            </TabsTrigger>
            <TabsTrigger value="avoid" className="gap-1.5">
              <Ban className="size-3.5" /> Avoid
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
        </Tabs>
      </div>
    </ScreenLayout>
  );
};

export default NutritionPlan;
