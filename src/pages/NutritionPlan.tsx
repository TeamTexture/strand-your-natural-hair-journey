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

interface FoodItem { emoji: string; name: string; body: string }

// Foods mapped to each deficiency we screen for. Vegan / vegetarian variants
// are filtered downstream so users only ever see foods they will actually eat.
const DEFICIENCY_FOODS: Record<
  string,
  { label: string; plant: FoodItem[]; animal: FoodItem[] }
> = {
  Ferritin: {
    label: "Low iron — boost ferritin",
    plant: [
      { emoji: "🥬", name: "Dark leafy greens", body: "Spinach, kale and watercress deliver non-heme iron plus vitamin C, which boosts absorption." },
      { emoji: "🫘", name: "Lentils & beans", body: "A cup of cooked lentils provides ~6 mg iron — pair with citrus or peppers for absorption." },
      { emoji: "🌰", name: "Pumpkin seeds", body: "One of the most iron-dense plant foods (~2.5 mg per 30 g) and rich in zinc." },
    ],
    animal: [
      { emoji: "🥩", name: "Lean red meat", body: "Heme iron from beef or lamb absorbs 2–3× better than plant iron — the fastest way to rebuild ferritin." },
      { emoji: "🐟", name: "Sardines & anchovies", body: "Iron, omega-3 and B12 in one tin — supports the follicle and oxygen delivery." },
    ],
  },
  "Vitamin D": {
    label: "Low vitamin D — support the follicle cycle",
    plant: [
      { emoji: "🍄", name: "UV-exposed mushrooms", body: "The only meaningful plant source of vitamin D2." },
      { emoji: "🥛", name: "Fortified plant milks", body: "Most oat / soy milks add D2 or D3 — check the label." },
    ],
    animal: [
      { emoji: "🐟", name: "Oily fish", body: "Salmon, mackerel and sardines are the strongest dietary source of D3." },
      { emoji: "🥚", name: "Egg yolks", body: "A daily yolk contributes meaningful D3 alongside biotin." },
    ],
  },
  Zinc: {
    label: "Low zinc — protein synthesis & scalp oil",
    plant: [
      { emoji: "🌰", name: "Pumpkin & hemp seeds", body: "A daily handful covers a third of your zinc need." },
      { emoji: "🫘", name: "Chickpeas & lentils", body: "Soaking and sprouting boosts zinc bioavailability." },
    ],
    animal: [
      { emoji: "🦪", name: "Oysters & shellfish", body: "Highest food source of zinc on the planet — a single oyster covers a day's need." },
      { emoji: "🥩", name: "Beef & lamb", body: "3–4 mg zinc per 100 g, alongside heme iron." },
    ],
  },
  Magnesium: {
    label: "Low magnesium — enzyme cofactor for growth",
    plant: [
      { emoji: "🥬", name: "Dark leafy greens", body: "Magnesium sits at the centre of every chlorophyll molecule." },
      { emoji: "🍫", name: "Dark chocolate (85%+)", body: "30 g delivers ~65 mg magnesium plus polyphenols." },
      { emoji: "🌰", name: "Almonds & cashews", body: "A small handful gives roughly 80 mg magnesium." },
    ],
    animal: [
      { emoji: "🐟", name: "Mackerel & salmon", body: "Oily fish are a quiet but reliable magnesium source." },
    ],
  },
  "Vitamin B12": {
    label: "Low B12 — oxygen delivery to the follicle",
    plant: [
      { emoji: "🥛", name: "Fortified plant milks & cereals", body: "The only reliable plant source — supplementation is usually needed too." },
      { emoji: "🍞", name: "Nutritional yeast", body: "Two tablespoons typically supply a full day of B12." },
    ],
    animal: [
      { emoji: "🥩", name: "Beef & liver", body: "Liver is the densest natural source of B12 known." },
      { emoji: "🐟", name: "Salmon & tuna", body: "A single fillet covers several days of B12." },
      { emoji: "🥚", name: "Eggs & dairy", body: "Steady, easy daily B12 for vegetarians." },
    ],
  },
  Folate: {
    label: "Low folate — rapid follicle cell division",
    plant: [
      { emoji: "🥬", name: "Leafy greens & asparagus", body: "Folate is literally named after foliage — the densest plant source." },
      { emoji: "🫘", name: "Lentils & black beans", body: "A cup of lentils delivers ~90% of daily folate need." },
      { emoji: "🥑", name: "Avocado", body: "A whole avocado supplies ~120 mcg folate plus vitamin E." },
    ],
    animal: [
      { emoji: "🥚", name: "Eggs", body: "Yolks contribute folate, biotin and choline together." },
    ],
  },
};

// Static fallback shown when there are no flagged deficiencies — this is the
// "what to eat for healthy hair" baseline focused on protein quality.
const PROTEIN_PLANT: FoodItem[] = [
  { emoji: "🫘", name: "Lentils & black beans", body: "~18 g protein per cooked cup, plus iron and folate — both critical to the hair growth phase. Fibre also supports gut health, which downstream affects nutrient absorption." },
  { emoji: "🌰", name: "Hemp & pumpkin seeds", body: "Hemp delivers all 9 essential amino acids in a single seed — rare for plants. Add to oats or smoothies daily for sustained keratin synthesis." },
  { emoji: "🥜", name: "Tofu, tempeh & edamame", body: "Complete soy protein with isoflavones that may help block DHT, the hormone implicated in androgenic thinning." },
  { emoji: "🌾", name: "Quinoa", body: "One of the few complete plant proteins — its lysine content directly supports collagen, which anchors the hair shaft to the scalp." },
  { emoji: "🥑", name: "Avocado + nuts", body: "Healthy monounsaturated fats help the body absorb the fat-soluble vitamins (A, D, E, K) needed to use the protein you eat." },
];

const PROTEIN_ANIMAL: FoodItem[] = [
  { emoji: "🥚", name: "Eggs", body: "The gold standard for hair: complete protein, biotin, B12, choline and selenium in one food. Two eggs daily covers ~30% of daily protein need." },
  { emoji: "🐟", name: "Oily fish (salmon, mackerel, sardines)", body: "Protein plus omega-3 reduces follicle inflammation and supports the scalp's lipid layer. Aim for 2 portions per week." },
  { emoji: "🍗", name: "Chicken & turkey breast", body: "~30 g lean protein per 100 g with B6 and niacin, both involved in delivering nutrients to the follicle." },
  { emoji: "🥩", name: "Lean red meat (1–2× weekly)", body: "Most bioavailable source of heme iron and zinc — the two minerals most often deficient in shedding hair." },
  { emoji: "🥛", name: "Greek yoghurt & cottage cheese", body: "Slow-digesting casein protein plus calcium and B12 — useful at breakfast or before bed for overnight repair." },
];

interface DietContentProps {
  isVegan: boolean;
  isVeg: boolean;
  flagged: Set<string>;
}

const DietContent = ({ isVegan, isVeg, flagged }: DietContentProps) => {
  const flaggedKeys = Array.from(flagged).filter((k) => DEFICIENCY_FOODS[k]);

  // Deficiency-driven view: at least one low marker we recognise.
  if (flaggedKeys.length > 0) {
    return (
      <>
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium">
          Foods targeted to your deficiencies
        </p>
        {flaggedKeys.map((key) => {
          const block = DEFICIENCY_FOODS[key];
          const animal = isVegan || isVeg ? [] : block.animal;
          return (
            <div key={key} className="space-y-2">
              <p className="text-sm font-display font-semibold mt-2">{block.label}</p>
              <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Plant-based</p>
              {block.plant.map((f) => (
                <FoodCard key={f.name} emoji={f.emoji} name={f.name} body={f.body} />
              ))}
              {animal.length > 0 && (
                <>
                  <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mt-2">Animal-based</p>
                  {animal.map((f) => (
                    <FoodCard key={f.name} emoji={f.emoji} name={f.name} body={f.body} />
                  ))}
                </>
              )}
            </div>
          );
        })}
        <SurfaceCard tone="gold">
          <p className="text-xs font-body leading-relaxed">
            For maximum iron absorption, pair iron-rich foods with vitamin C and avoid tea, coffee
            or dairy within 1 hour of iron-rich meals.
          </p>
        </SurfaceCard>
        <SourceNote>
          Dietary guidance based on <em>How To Love Your Afro</em> by Paige Lewin (Bloomsbury Publishing)
        </SourceNote>
      </>
    );
  }

  // No deficiencies — show the protein-for-healthy-hair baseline.
  const animalList = isVegan || isVeg ? [] : PROTEIN_ANIMAL;
  return (
    <>
      <SurfaceCard tone="gold">
        <p className="text-xs font-body leading-relaxed">
          Your blood markers look balanced — great work. Hair is ~95% keratin, a protein, so this
          plan focuses on protein quality. Aim for roughly <strong>1.2–1.6 g of protein per kg of
          bodyweight</strong> per day, spread across meals.
        </p>
      </SurfaceCard>

      <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mt-3">
        Plant-based proteins for hair
      </p>
      {PROTEIN_PLANT.map((f) => (
        <FoodCard key={f.name} emoji={f.emoji} name={f.name} body={f.body} />
      ))}

      {animalList.length > 0 && (
        <>
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mt-4">
            Animal-based proteins for hair
          </p>
          {animalList.map((f) => (
            <FoodCard key={f.name} emoji={f.emoji} name={f.name} body={f.body} />
          ))}
        </>
      )}

      <SurfaceCard>
        <p className="text-xs font-body leading-relaxed">
          <strong>Combine smartly.</strong> Plant proteins are stronger together — rice + beans, hummus
          + pitta, peanut butter + wholegrain bread — to deliver the full amino-acid profile your
          follicles need.
        </p>
      </SurfaceCard>

      <SourceNote>
        Dietary guidance based on <em>How To Love Your Afro</em> by Paige Lewin (Bloomsbury Publishing)
      </SourceNote>
    </>
  );
};

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

          <TabsContent value="diet" className="space-y-4 mt-4">
            <DietContent isVegan={isVegan} isVeg={isVeg} flagged={f} />
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
