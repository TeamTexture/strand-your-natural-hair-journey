import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Mic } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useVoicenoteCounts } from "@/hooks/useVoicenoteCounts";

interface P { key: string; emoji: string; name: string; brand: string; pct: number }
const items: P[] = [
  { key: "wl-camille-rose-moisture-retention", emoji: "🧴", name: "Moisture Retention Serum", brand: "Camille Rose", pct: 92 },
  { key: "wl-inkey-rosemary-growth-oil", emoji: "🌸", name: "Rosemary Growth Oil", brand: "The Inkey List", pct: 85 },
  { key: "wl-briogeo-honey-whip", emoji: "🫙", name: "Honey Whip Moisturiser", brand: "Briogeo", pct: 78 },
];

const Wishlist = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const { counts } = useVoicenoteCounts(items.map((i) => i.key));

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="Wishlist"
        right={
          <button onClick={() => navigate("/products/avoidlist")} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium">
            Intel
          </button>
        }
      />

      <div className="px-5 pb-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => toast("Camera opening")}
          className="p-4 rounded-[14px] border-2 border-dashed border-primary/50 bg-card text-center"
        >
          <div className="text-3xl mb-2">📷</div>
          <p className="text-xs font-medium">Take a Photo</p>
          <p className="text-[10px] text-muted-foreground">Use your camera</p>
        </button>
        <button
          onClick={() => toast("Choose from camera roll")}
          className="p-4 rounded-[14px] border-2 border-dashed border-primary/50 bg-card text-center"
        >
          <div className="text-3xl mb-2">🖼️</div>
          <p className="text-xs font-medium">Upload a Photo</p>
          <p className="text-[10px] text-muted-foreground">From your camera roll</p>
        </button>
      </div>

      <div className="px-5 space-y-3 pb-4">
        {items.map((p) => {
          const isOpen = expanded === p.key;
          const noteCount = counts[p.key] ?? 0;
          return (
            <SurfaceCard key={p.key} padded={false} className="overflow-hidden">
              <div className="p-3.5 flex items-center gap-3">
                <div className="size-12 rounded-[10px] bg-primary/15 flex items-center justify-center text-2xl shrink-0">{p.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>
                  {noteCount > 0 && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-primary font-medium">
                      <Mic className="size-3" /> {noteCount} note{noteCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <span className="bg-primary text-primary-foreground text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0">{p.pct}%</span>
                <button
                  onClick={() => setExpanded(isOpen ? null : p.key)}
                  className="size-11 rounded-full hover:bg-primary/10 flex items-center justify-center shrink-0"
                  aria-label={isOpen ? "Hide voicenotes" : "Show voicenotes"}
                  aria-expanded={isOpen}
                >
                  <ChevronDown
                    className={cn(
                      "size-4 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>
              </div>

              {isOpen && (
                <div className="px-3.5 pb-3.5 pt-1 border-t border-border/60">
                  <ProductVoicenotes
                    productKey={p.key}
                    productName={p.name}
                    productBrand={p.brand}
                  />
                </div>
              )}
            </SurfaceCard>
          );
        })}
      </div>

      <div className="px-5 pb-6">
        <SurfaceCard tone="gold">
          <p className="text-sm font-semibold mb-1">💛 Strand Member Discount</p>
          <p className="text-xs text-foreground/80 leading-snug">
            Camille Rose offering 15% off to Strand members who have saved their products.
          </p>
          <span className="inline-block mt-3 bg-primary text-primary-foreground text-[11px] tracking-[0.2em] font-medium px-3 py-1.5 rounded">
            STRAND15
          </span>
        </SurfaceCard>
      </div>
    </ScreenLayout>
  );
};

export default Wishlist;
