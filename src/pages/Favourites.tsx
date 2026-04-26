import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Mic, Heart } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoicenoteCounts } from "@/hooks/useVoicenoteCounts";
import { useUserProducts } from "@/hooks/useUserProducts";
import { toast } from "sonner";

const Favourites = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const { products, loading, setFavourite } = useUserProducts("favourite");
  const { counts } = useVoicenoteCounts(products.map((p) => p.product_key));

  const handleUnfavourite = async (id: string, name: string) => {
    await setFavourite(id, false);
    toast(`Removed ${name} from favourites`);
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="Favourites"
        right={
          <button
            onClick={() => navigate("/products/avoidlist")}
            className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium"
          >
            Ingredients
          </button>
        }
      />

      <div className="px-5 pb-3">
        <p className="text-[11px] text-muted-foreground leading-snug">
          Tap the <Heart className="inline size-3 -mt-0.5 fill-current text-destructive" /> on any
          product to add it here. When the same ingredient shows up in 3 or more favourites it gets
          a <span className="text-good font-medium">Green Flag</span> on the Ingredients page.
        </p>
      </div>

      <div className="px-5 space-y-3 pb-4">
        {loading ? (
          <LoadingDot label="Loading your favourites…" />
        ) : products.length === 0 ? (
          <EmptyState
            message="No favourites yet"
            hint="Open any product and tap the heart to add it to your favourites."
          />
        ) : (
          products.map((p) => {
            const isOpen = expanded === p.product_key;
            const noteCount = counts[p.product_key] ?? 0;
            return (
              <SurfaceCard key={p.id} padded={false} className="overflow-hidden">
                <div className="p-3.5 flex items-center gap-3">
                  <div className="size-12 rounded-[10px] overflow-hidden bg-secondary shrink-0">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="size-full flex items-center justify-center text-2xl bg-primary/15">
                        🧴
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      navigate(
                        `/products/ingredient?key=${encodeURIComponent(
                          p.product_key,
                        )}&name=${encodeURIComponent(p.name)}&brand=${encodeURIComponent(
                          p.brand ?? "",
                        )}`,
                      )
                    }
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm font-medium leading-tight truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>
                    {noteCount > 0 && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-primary font-medium">
                        <Mic className="size-3" /> {noteCount} note{noteCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setExpanded(isOpen ? null : p.product_key)}
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
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-border/60 space-y-3">
                    <ProductVoicenotes
                      productKey={p.product_key}
                      productName={p.name}
                      productBrand={p.brand ?? ""}
                    />
                    <Button
                      variant="goldOutline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleUnfavourite(p.id, p.name)}
                    >
                      <Heart className="size-3.5 mr-1 fill-current" /> Remove from favourites
                    </Button>
                  </div>
                )}
              </SurfaceCard>
            );
          })
        )}
      </div>
    </ScreenLayout>
  );
};

export default Favourites;
