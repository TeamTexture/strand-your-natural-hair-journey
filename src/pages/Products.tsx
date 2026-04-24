import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "shelf", label: "Shelf" },
  { id: "wishlist", label: "Wishlist" },
  { id: "intel", label: "Ingredient Intel" },
];

interface P { emoji: string; name: string; brand: string; stars: number; score: number }
const products: P[] = [
  { emoji: "🧴", name: "Moisture Retention Serum", brand: "Camille Rose", stars: 5, score: 92 },
  { emoji: "🫙", name: "Honey Whip Moisturiser", brand: "Briogeo", stars: 4, score: 78 },
  { emoji: "🧪", name: "Curl Defining Cream", brand: "Cantu", stars: 3, score: 64 },
  { emoji: "🌿", name: "Scalp Serum", brand: "Mielle", stars: 4, score: 88 },
];

const Stars = ({ n }: { n: number }) => (
  <span className="text-[10px] text-primary tracking-tight">
    {"★".repeat(n)}<span className="text-border">{"★".repeat(5 - n)}</span>
  </span>
);

const Products = () => {
  const navigate = useNavigate();
  const goWishlist = () => navigate("/products/wishlist");
  const goIntel = () => navigate("/products/avoidlist");

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="My Products"
        back={false}
        right={
          <button onClick={goWishlist} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium">
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
                  "py-2 text-xs rounded-md font-medium transition-colors",
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
        {products.map((p) => (
          <button
            key={p.name}
            onClick={() => navigate("/products/ingredient")}
            className="w-full p-3.5 flex items-center gap-3 text-left bg-card border border-border rounded-[14px] hover:border-primary/50 transition-colors"
          >
            <div className="size-12 rounded-[10px] bg-primary/15 flex items-center justify-center text-2xl">{p.emoji}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium font-body leading-tight truncate">{p.name}</p>
              <p className="text-[11px] text-muted-foreground">{p.brand}</p>
              <Stars n={p.stars} />
            </div>
            <div className="size-10 rounded-full border-2 border-primary text-primary flex items-center justify-center text-xs font-bold">
              {p.score}
            </div>
          </button>
        ))}
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
