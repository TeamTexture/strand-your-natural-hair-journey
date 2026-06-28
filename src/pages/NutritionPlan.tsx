import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";


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
interface AiPlan { summary?: string; diet?: AiCard[]; avoid?: AiCard[] }

const SourceNote = ({ children }: { children?: React.ReactNode }) => (
  <p className="text-[11px] italic text-muted-foreground font-body mt-1">
    {children ?? "Based on How To Love Your Afro by Paige Lewin"}
  </p>
);

interface Card { title: string; meta?: string; body: string }

const SupplementCard = ({ c }: { c: Card }) => (
  <SurfaceCard className="border-l-4 border-l-primary">
    <p className="font-body font-semibold text-sm">{c.title}</p>
    {c.meta && <p className="text-[11px] uppercase tracking-[0.15em] text-primary mt-0.5">{c.meta}</p>}
    <p className="text-xs text-foreground/85 font-body mt-1 leading-relaxed">{c.body}</p>
  </SurfaceCard>
);

const FoodCard = ({ emoji, name, body }: AiCard) => (
  <SurfaceCard>
    <div className="flex gap-3">
      <span className="text-2xl shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{name}</p>
        <p className="text-xs text-foreground/85 font-body mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  </SurfaceCard>
);

const AvoidCard = ({ emoji, name, body, severity }: AiCard) => (
  <SurfaceCard className={`border-l-4 ${severity === "high" ? "border-l-destructive" : "border-l-destructive/50"}`}>
    <div className="flex gap-3">
      <span className="text-2xl shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{name}</p>
        <p className="text-xs text-foreground/85 font-body mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  </SurfaceCard>
);

const NutritionPlan = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    diet: "unknown",
    alcohol: "unknown",
    flagged: new Set(),
  });
  const [plan, setPlan] = useState<AiPlan | null>(null);

  const fetchPlan = async (force = false, currentProfile = profile) => {
    setAiLoading(true);
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
        return;
      }
      if (data?.plan) setPlan(data.plan as AiPlan);
    } catch (e) {
      console.error("nutrition-plan invoke failed", e);
      toast.error("Couldn't generate your plan.");
    } finally {
      setAiLoading(false);
    }
  };

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
        // Kick off AI plan generation (cached after first run)
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

  const isVeg = profile.diet === "vegan" || profile.diet === "vegetarian";
  const f = profile.flagged;

  // Supplements remain deterministic — these are clinical, not editorial.
  const supplements: Card[] = [];
  if (f.has("Ferritin")) supplements.push({
    title: "Iron supplement",
    meta: "Ferrous sulfate 200mg or ferrous fumarate",
    body: "Take with vitamin C. Avoid with tea or coffee. Low ferritin is one of the most common causes of hair shedding.",
  });
  if (f.has("Vitamin D")) supplements.push({
    title: "Vitamin D3",
    meta: "1000–2000 IU daily",
    body: "Darker skin tones produce less vitamin D from UK sunlight. Vitamin D deficiency affects the hair follicle cycle directly.",
  });
  if (f.has("Zinc")) supplements.push({
    title: "Zinc",
    meta: "8–11 mg daily — do not exceed 40 mg",
    body: "Supports protein synthesis in the follicle and scalp oil regulation.",
  });
  if (f.has("Magnesium")) supplements.push({
    title: "Magnesium glycinate",
    meta: "200–400 mg daily",
    body: "Supports over 300 enzymatic processes involved in hair growth.",
  });
  if (f.has("Vitamin B12") || isVeg) supplements.push({
    title: "Vitamin B12",
    meta: "Methylcobalamin 1000 mcg daily",
    body: "Essential for plant-based diets. Deficiency limits oxygen to follicles.",
  });
  if (f.has("Folate")) supplements.push({
    title: "Folate",
    meta: "400 mcg daily",
    body: "Critical for cell division in rapidly dividing follicle cells.",
  });
  supplements.push({
    title: "Omega-3",
    meta: "1000 mg fish oil or algae oil",
    body: "Supports scalp moisture and reduces follicle inflammation.",
  });

  const renderAiSection = (cards: AiCard[] | undefined, kind: "diet" | "avoid") => {
    if (aiLoading && !cards) {
      return <LoadingDot label="Personalising your plan…" />;
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
        <FoodCard key={`${c.name}-${i}`} {...c} />
      ) : (
        <AvoidCard key={`${c.name}-${i}`} {...c} />
      ),
    );
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Nutrition Plan" onBack={() => navigate(-1)} />
      <div className="px-5 pt-1 pb-8">
        <h1 className="font-display text-[26px] leading-tight mb-4">Your Nutrition Plan</h1>

        {plan?.summary && (
          <SurfaceCard tone="gold" className="mb-3">
            <p className="text-xs font-body leading-relaxed">{plan.summary}</p>
          </SurfaceCard>
        )}

        <Tabs defaultValue="supplements">
          <TabsList className="grid w-full grid-cols-3 bg-secondary">
            <TabsTrigger value="supplements">Supplements</TabsTrigger>
            <TabsTrigger value="diet">Diet</TabsTrigger>
            <TabsTrigger value="avoid">Avoid</TabsTrigger>
          </TabsList>

          <TabsContent value="supplements" className="space-y-3 mt-4">
            {supplements.map((c) => <SupplementCard key={c.title} c={c} />)}
            <SourceNote />
            <SurfaceCard tone="gold">
              <p className="text-[11px] font-body leading-relaxed">
                These recommendations are based on your blood test results and the guidance in
                <em> How To Love Your Afro</em> by Paige Lewin. They are not medical advice. Always
                consult your GP before starting any new supplement, especially if you are pregnant,
                breastfeeding, or on medication.
              </p>
            </SurfaceCard>
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
