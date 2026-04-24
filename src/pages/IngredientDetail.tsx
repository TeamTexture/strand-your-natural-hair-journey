import { Heart } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Ing { tone: "good" | "warn" | "bad"; name: string; body: string }
const ingredients: Ing[] = [
  { tone: "good", name: "Glycerin", body: "Humectant — draws moisture into high-porosity hair. Excellent match." },
  { tone: "good", name: "Castor Oil", body: "Seals cuticle, supports length retention. Addresses your ferritin deficiency." },
  { tone: "good", name: "Aloe Vera", body: "Natural humectant — soothes and hydrates. Good for your dry scalp." },
  { tone: "warn", name: "Fragrance / Parfum", body: "May irritate your dry scalp diagnosis. Patch test recommended." },
  { tone: "bad", name: "Isopropyl Alcohol", body: "⚠ On your Avoid List. Linked to dryness in your 3 lowest-rated products." },
];

const dotClass = { good: "bg-good", warn: "bg-warn", bad: "bg-destructive" };

const IngredientDetail = () => {
  const [rating, setRating] = useState(5);
  const [searchParams] = useSearchParams();
  const productKey = searchParams.get("key") ?? "camille-rose-moisture-retention";
  const productName = searchParams.get("name") ?? "Moisture Retention Serum";
  const productBrand = searchParams.get("brand") ?? "Camille Rose";
  return (
    <ScreenLayout>
      <TitleBar
        title="Ingredient Analysis"
        right={
          <button
            onClick={() => toast("Added to favourites")}
            aria-label="Favourite"
            className="text-primary"
          >
            <Heart className="size-5" />
          </button>
        }
      />

      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard className="flex items-center gap-3">
          <div className="size-14 rounded-[12px] bg-primary/15 flex items-center justify-center text-2xl">🧴</div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-base font-semibold leading-tight">{productName}</p>
            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mt-0.5">{productBrand}</p>
          </div>
          <div className="text-center">
            <div className="size-12 rounded-full border-2 border-primary text-primary flex items-center justify-center font-bold">92</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Match</p>
          </div>
        </SurfaceCard>

        <SurfaceCard tone="gold">
          <p className="text-xs font-semibold mb-1">🤖 AI Summary</p>
          <p className="text-sm leading-snug text-foreground/85">
            Strong moisture match for your high-porosity natural hair. Glycerin and castor oil are excellent for your ferritin deficiency profile. One ingredient flagged based on your dry scalp diagnosis.
          </p>
        </SurfaceCard>

        <SectionLabel>Ingredient breakdown</SectionLabel>
        <SurfaceCard className="divide-y divide-border/60 !py-1">
          {ingredients.map((i) => (
            <div key={i.name} className="flex items-start gap-3 py-3">
              <span className={cn("size-2.5 rounded-full mt-1.5 shrink-0", dotClass[i.tone])} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium font-body leading-tight">{i.name}</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{i.body}</p>
              </div>
            </div>
          ))}
        </SurfaceCard>

        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">Your Rating</p>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={cn("text-3xl transition-transform", n <= rating ? "text-primary" : "text-border", "hover:scale-110")}
                aria-label={`${n} stars`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <Button variant="gold" size="pill" onClick={() => toast("Rating saved — ingredient map updated")}>
          Save Rating
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default IngredientDetail;
