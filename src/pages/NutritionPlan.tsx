import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingDot from "@/components/LoadingDot";
import { evaluate } from "@/data/bloodRanges";

type Diet = "omnivore" | "vegetarian" | "vegan" | "unknown";
type Alcohol = "none" | "light" | "moderate" | "heavy" | "unknown";

interface Profile {
  diet: Diet;
  alcohol: Alcohol;
  flagged: Set<string>; // markers that are LOW
}

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

const FoodCard = ({ emoji, name, body, hide }: { emoji: string; name: string; body: string; hide?: boolean }) =>
  hide ? null : (
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

const AvoidCard = ({ emoji, name, body }: { emoji: string; name: string; body: string }) => (
  <SurfaceCard className="border-l-4 border-l-destructive/70">
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
  const [profile, setProfile] = useState<Profile>({
    diet: "unknown",
    alcohol: "unknown",
    flagged: new Set(),
  });

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
        const health = JSON.parse(localStorage.getItem("strand_health_profile") || "{}");
        const diet = (health.diet as Diet) || "unknown";
        const alcohol = (health.alcohol as Alcohol) || "unknown";
        setProfile({ diet, alcohol, flagged });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Nutrition Plan" />
        <LoadingDot label="Loading your plan…" />
      </ScreenLayout>
    );
  }

  const isVegan = profile.diet === "vegan";
  const isVeg = isVegan || profile.diet === "vegetarian";
  const heavyDrinker = profile.alcohol === "heavy";
  const f = profile.flagged;

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
  // Always show
  supplements.push({
    title: "Omega-3",
    meta: "1000 mg fish oil or algae oil",
    body: "Supports scalp moisture and reduces follicle inflammation.",
  });

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Nutrition Plan" onBack={() => navigate(-1)} />
      <div className="px-5 pt-1 pb-8">
        <h1 className="font-display text-[26px] leading-tight mb-4">Your Nutrition Plan</h1>

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
            <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium">Foods to prioritise</p>

            {isVeg && (
              <FoodCard emoji="🫘" name="Lentils and legumes" body="Plant-based iron and protein." />
            )}
            <FoodCard emoji="🥬" name="Dark leafy greens" body="Rich in iron, folate and vitamin C. Essential for users with low ferritin — vitamin C in greens helps iron absorb." />
            <FoodCard emoji="🥚" name="Eggs" body="Complete protein containing biotin, B12 and zinc." hide={isVegan} />
            <FoodCard emoji="🐟" name="Oily fish" body="Omega-3, vitamin D and protein. Important for scalp health — especially relevant in the UK." hide={isVeg} />
            <FoodCard emoji="🌰" name="Pumpkin & sunflower seeds" body="Zinc, magnesium and vitamin E in one handful." />
            <FoodCard emoji="🫐" name="Berries" body="Vitamin C supports iron absorption alongside iron-rich foods." />
            {!isVeg && (
              <FoodCard emoji="🫘" name="Lentils and legumes" body="Plant-based iron and protein." />
            )}
            <FoodCard emoji="🥑" name="Avocado" body="Vitamin E, healthy fats and biotin support hair structure and scalp health." />

            <SurfaceCard tone="gold">
              <p className="text-xs font-body leading-relaxed">
                For maximum iron absorption, eat iron-rich foods with vitamin C and avoid tea, coffee
                or calcium within 1 hour of iron-rich meals.
              </p>
            </SurfaceCard>
            <SourceNote>
              Dietary guidance based on <em>How To Love Your Afro</em> by Paige Lewin (Bloomsbury Publishing)
            </SourceNote>
          </TabsContent>

          <TabsContent value="avoid" className="space-y-3 mt-4">
            <AvoidCard emoji="🍵" name="Excess tea and coffee" body="Tannins bind to iron and reduce absorption by up to 60%. Avoid within 1 hour of iron-rich meals." />
            <AvoidCard emoji="🥛" name="Calcium with iron" body="Calcium directly competes with iron for absorption. Avoid dairy at the same time as iron-rich meals." />
            <AvoidCard
              emoji="🍷"
              name={heavyDrinker ? "Alcohol — high priority" : "Alcohol"}
              body={`Depletes zinc and B vitamins and disrupts sleep.${heavyDrinker ? " Your profile shows heavy intake — reducing this is one of the highest-impact changes you can make." : ""}`}
            />
            <AvoidCard emoji="🍬" name="High sugar and ultra-processed foods" body="Creates inflammation that disrupts the follicle cycle and accelerates shedding." />
            <AvoidCard emoji="🧂" name="High sodium" body="Can disrupt scalp circulation and exacerbate seborrheic dermatitis." />
            <SourceNote />
          </TabsContent>
        </Tabs>
      </div>
    </ScreenLayout>
  );
};

export default NutritionPlan;
