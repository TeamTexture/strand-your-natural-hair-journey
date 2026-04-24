import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Mic } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useVoicenoteCounts } from "@/hooks/useVoicenoteCounts";

const tabs = [
  { id: "shelf", label: "Shelf" },
  { id: "wishlist", label: "Wishlist" },
  { id: "intel", label: "Ingredient Intel" },
];

interface P { key: string; emoji: string; name: string; brand: string; stars: number; score: number }
const products: P[] = [
  { key: "camille-rose-moisture-retention", emoji: "🧴", name: "Moisture Retention Serum", brand: "Camille Rose", stars: 5, score: 92 },
  { key: "briogeo-honey-whip", emoji: "🫙", name: "Honey Whip Moisturiser", brand: "Briogeo", stars: 4, score: 78 },
  { key: "cantu-curl-defining-cream", emoji: "🧪", name: "Curl Defining Cream", brand: "Cantu", stars: 3, score: 64 },
  { key: "mielle-scalp-serum", emoji: "🌿", name: "Scalp Serum", brand: "Mielle", stars: 4, score: 88 },
];

const Stars = ({ n }: { n: number }) => (
  <span className="text-[10px] text-primary tracking-tight">
    {"★".repeat(n)}<span className="text-border">{"★".repeat(5 - n)}</span>
  </span>
);

const Products = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const { counts } = useVoicenoteCounts(products.map((p) => p.key));
  const goWishlist = () => navigate("/products/wishlist");
  const goIntel = () => navigate("/products/avoidlist");

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="My Products"
        back={false}
        right={
          <button onClick={goWishlist} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium px-2 min-h-[44px]">
            Wishlist
          </button>
        }
      />

      <div className="px-5 pb-4">
        <div className="grid grid-cols-3 gap-1 p-1 bg-card border border-border rounded-[10px]">
          {tabs.map((t) => {
            const active = t.id === "shelf";
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id === "wishlist") goWishlist();
                  else if (t.id === "intel") goIntel();
                }}
                className={cn(
                  "py-2 text-xs rounded-md font-medium transition-colors min-h-[40px] truncate px-1",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 space-y-3 pb-4">
        {products.map((p) => {
          const isOpen = expanded === p.key;
          return (
            <div
              key={p.key}
              className="bg-card border border-border rounded-[14px] overflow-hidden"
            >
              <div className="p-3.5 flex items-center gap-3">
                <button
                  onClick={() => navigate("/products/ingredient")}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="size-12 rounded-[10px] bg-primary/15 flex items-center justify-center text-2xl shrink-0">
                    {p.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium font-body leading-tight truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>
                    <Stars n={p.stars} />
                  </div>
                  <div className="size-10 rounded-full border-2 border-primary text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {p.score}
                  </div>
                </button>
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
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-6 space-y-3">
        <Button variant="gold" size="pill" onClick={() => toast("Camera opening — point at product label")}>
          + Scan a New Product
        </Button>
        <Button variant="goldOutline" size="pill" onClick={() => toast("Choose from camera roll")}>
          + Upload Screenshot
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default Products;
