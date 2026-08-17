import { Info } from "lucide-react";
import { useSensitivities } from "@/hooks/useSensitivities";

/**
 * Excluding a whole food group leaves a nutrient job to fill. Named plainly,
 * with permitted alternatives — substitute, never subtract.
 */
const GAPS: Record<string, { nutrient: string; fillWith: string }> = {
  fish: {
    nutrient: "Omega-3",
    fillWith: "ground flaxseed, chia, walnuts, rapeseed oil, or an algae-oil supplement",
  },
  milk: {
    nutrient: "Calcium",
    fillWith: "fortified plant milks, tofu set with calcium, tinned sardines if you eat them, kale, and pak choi",
  },
  eggs: {
    nutrient: "B12 and choline",
    fillWith: "fortified nutritional yeast, fortified plant milks, and legumes",
  },
  gluten: {
    nutrient: "Iron and B vitamins from fortified cereals",
    fillWith: "quinoa, buckwheat, gluten-free oats, lentils, and pumpkin seeds",
  },
  soya: {
    nutrient: "Plant protein",
    fillWith: "lentils, chickpeas, beans, peas, hemp seeds, and quinoa",
  },
  tree_nuts: {
    nutrient: "Vitamin E and healthy fats",
    fillWith: "sunflower seeds, pumpkin seeds, avocado, and olive oil",
  },
  peanuts: {
    nutrient: "Protein and healthy fats",
    fillWith: "sunflower seed butter, chickpeas, and pumpkin seeds",
  },
  crustaceans: { nutrient: "Zinc and iodine", fillWith: "pumpkin seeds, chickpeas, and seaweed" },
  molluscs: { nutrient: "Zinc and iodine", fillWith: "pumpkin seeds, lentils, and seaweed" },
};

const NutrientGapNote = () => {
  const { entriesFor } = useSensitivities();
  const gaps = entriesFor("dietary")
    .filter((e) => e.severity === "avoid" && e.code && GAPS[e.code])
    .map((e) => ({ label: e.label, ...GAPS[e.code as string] }));

  if (gaps.length === 0) return null;

  return (
    <div className="rounded-[14px] border border-border/60 bg-muted/60 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Info className="mt-[2px] size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-body text-[11px] uppercase tracking-wide text-muted-foreground">
            Worth covering another way
          </p>
          <ul className="mt-1 space-y-1">
            {gaps.map((g) => (
              <li key={g.label} className="font-body text-[11.5px] leading-relaxed">
                <span className="font-semibold">{g.nutrient}</span>
                <span className="text-muted-foreground"> — usually comes from {g.label.toLowerCase()}. Build it from {g.fillWith}.</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NutrientGapNote;
