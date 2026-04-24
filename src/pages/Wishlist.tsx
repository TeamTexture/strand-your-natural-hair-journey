import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { toast } from "sonner";

interface P { emoji: string; name: string; brand: string; pct: number }
const items: P[] = [
  { emoji: "🧴", name: "Moisture Retention Serum", brand: "Camille Rose", pct: 92 },
  { emoji: "🌸", name: "Rosemary Growth Oil", brand: "The Inkey List", pct: 85 },
  { emoji: "🫙", name: "Honey Whip Moisturiser", brand: "Briogeo", pct: 78 },
];

const Wishlist = () => {
  const navigate = useNavigate();
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
        {items.map((p) => (
          <SurfaceCard key={p.name} className="flex items-center gap-3">
            <div className="size-12 rounded-[10px] bg-primary/15 flex items-center justify-center text-2xl">{p.emoji}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight truncate">{p.name}</p>
              <p className="text-[11px] text-muted-foreground">{p.brand}</p>
            </div>
            <span className="bg-primary text-primary-foreground text-[11px] font-bold px-2.5 py-1 rounded-full">{p.pct}%</span>
          </SurfaceCard>
        ))}
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
