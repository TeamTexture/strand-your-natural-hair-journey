import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Mic } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import FilePickerButton from "@/components/FilePickerButton";
import { cn } from "@/lib/utils";
import { useVoicenoteCounts } from "@/hooks/useVoicenoteCounts";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useProductScan } from "@/hooks/useProductScan";

const tabs = [
  { id: "shelf",    label: "Shelf" },
  { id: "wishlist", label: "Wishlist" },
  { id: "intel",    label: "Ingredients" },
];

const Stars = ({ n }: { n: number }) => (
  <span className="text-[10px] text-primary tracking-tight">
    {"★".repeat(n)}<span className="text-border">{"★".repeat(5 - n)}</span>
  </span>
);

const Products = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const { products, loading } = useUserProducts("shelf");
  const { counts } = useVoicenoteCounts(products.map(p => p.product_key));
  const { startScan, busy } = useProductScan();

  const goWishlist = () => navigate("/products/wishlist");
  const goIntel = () => navigate("/products/avoidlist");

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="My Products"
        back={false}
        right={
          <button onClick={() => navigate("/products/repository")} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium px-2 min-h-[44px]">
            All Products
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
        {loading ? (
          <LoadingDot label="Loading your shelf…" />
        ) : products.length === 0 ? (
          <EmptyState
            message="Your shelf is empty"
            hint="Scan or upload a product to get started."
          />
        ) : (
          products.map((p) => {
            const isOpen = expanded === p.product_key;
            const noteCount = counts[p.product_key] ?? 0;
            const score = p.match_score ?? 0;
            const stars = p.rating ?? 0;
            return (
              <div
                key={p.id}
                className="bg-card border border-border rounded-[14px] overflow-hidden"
              >
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
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium font-body leading-tight truncate">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Stars n={stars} />
                        {noteCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-primary font-medium">
                            <Mic className="size-3" /> {noteCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="size-10 rounded-full border-2 border-primary text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {score}
                    </div>
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
              </div>
            );
          })
        )}
      </div>

      <div className="px-5 pb-6 space-y-3">
        <FilePickerButton variant="gold" size="pill" preferCamera disabled={busy} onPick={(f) => startScan(f, "shelf")}>
          + Scan a New Product
        </FilePickerButton>
        <FilePickerButton variant="goldOutline" size="pill" disabled={busy} onPick={(f) => startScan(f, "shelf")}>
          + Upload Screenshot
        </FilePickerButton>
      </div>
    </ScreenLayout>
  );
};

export default Products;
