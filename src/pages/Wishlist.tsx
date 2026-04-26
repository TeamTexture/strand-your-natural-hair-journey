import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Mic } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import FilePickerButton from "@/components/FilePickerButton";
import { cn } from "@/lib/utils";
import { useVoicenoteCounts } from "@/hooks/useVoicenoteCounts";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useProductScan } from "@/hooks/useProductScan";

const Wishlist = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const { products, loading } = useUserProducts("wishlist");
  const { counts } = useVoicenoteCounts(products.map(p => p.product_key));
  const { startScan, busy } = useProductScan();

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="Wishlist"
        right={
          <button onClick={() => navigate("/products/avoidlist")} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium">
            Ingredients
          </button>
        }
      />

      <div className="px-5 pb-4 grid grid-cols-2 gap-3">
        <FilePickerButton
          variant="goldGhost"
          preferCamera
          disabled={busy}
          onPick={(f) => startScan(f, "wishlist")}
          className="!h-auto !p-4 !rounded-[14px] border-2 border-dashed border-primary/50 bg-card text-center flex-col"
        >
          <div className="text-3xl mb-2">📷</div>
          <p className="text-xs font-medium">Take a Photo</p>
          <p className="text-[10px] text-muted-foreground">Use your camera</p>
        </FilePickerButton>
        <FilePickerButton
          variant="goldGhost"
          disabled={busy}
          onPick={(f) => startScan(f, "wishlist")}
          className="!h-auto !p-4 !rounded-[14px] border-2 border-dashed border-primary/50 bg-card text-center flex-col"
        >
          <div className="text-3xl mb-2">🖼️</div>
          <p className="text-xs font-medium">Upload a Photo</p>
          <p className="text-[10px] text-muted-foreground">From your camera roll</p>
        </FilePickerButton>
      </div>

      <div className="px-5 space-y-3 pb-4">
        {loading ? (
          <LoadingDot label="Loading your wishlist…" />
        ) : products.length === 0 ? (
          <EmptyState
            message="Your wishlist is empty"
            hint="Scan or upload a product to add it to your wishlist."
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
                      <div className="size-full flex items-center justify-center text-2xl bg-primary/15">🧴</div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      navigate(
                        `/products/ingredient?key=${encodeURIComponent(p.product_key)}&name=${encodeURIComponent(p.name)}&brand=${encodeURIComponent(p.brand ?? "")}`,
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
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-border/60">
                    <ProductVoicenotes
                      productKey={p.product_key}
                      productName={p.name}
                      productBrand={p.brand ?? ""}
                    />
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

export default Wishlist;
