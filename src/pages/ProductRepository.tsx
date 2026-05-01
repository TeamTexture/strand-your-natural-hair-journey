import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { cn } from "@/lib/utils";
import ProductThumb from "@/components/ProductThumb";
import { useUserProducts, UserProduct } from "@/hooks/useUserProducts";
import { useWashDays } from "@/hooks/useWashDays";

type Tab = "shelf" | "wishlist" | "off-shelf";

const tabs: { id: Tab; label: string }[] = [
  { id: "shelf",     label: "Shelf" },
  { id: "wishlist",  label: "Wishlist" },
  { id: "off-shelf", label: "Off Shelf" },
];

const Stars = ({ n }: { n: number }) => (
  <span className="text-[10px] text-primary tracking-tight">
    {"★".repeat(n)}<span className="text-border">{"★".repeat(5 - n)}</span>
  </span>
);

const formatDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const ProductRepository = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("shelf");
  const { allProducts, loading } = useUserProducts("all");
  const { washDays } = useWashDays();

  // Map product_id -> last-used date from wash_days
  const lastUsedByProductId = useMemo(() => {
    const map = new Map<string, string>();
    for (const wd of washDays) {
      for (const pid of wd.product_ids ?? []) {
        if (!map.has(pid)) map.set(pid, wd.wash_date);
      }
    }
    return map;
  }, [washDays]);

  const filtered: UserProduct[] = useMemo(() => {
    switch (tab) {
      case "shelf":     return allProducts.filter(p => p.on_shelf);
      case "wishlist":  return allProducts.filter(p => p.on_wishlist);
      case "off-shelf": return allProducts.filter(p => !p.on_shelf && p.previously_on_shelf);
    }
  }, [allProducts, tab]);

  // Personalised flags removed — we present neutral information only and
  // leave decisions to the user. Avoid/favourite lists are still kept for
  // the user's own reference inside the ingredient lists screen.

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="All Products" back />

      <div className="px-5 pb-4">
        <div className="grid grid-cols-3 gap-1 p-1 bg-card border border-border rounded-[10px]">
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
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

      <div className="px-5 space-y-3 pb-6">
        {loading ? (
          <LoadingDot label="Loading your products…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            message={
              tab === "shelf"     ? "No products on your shelf"
              : tab === "wishlist" ? "Your wishlist is empty"
              : "No off-shelf products yet"
            }
            hint={
              tab === "off-shelf"
                ? "Products you remove from your shelf will appear here."
                : "Scan or upload a product to get started."
            }
          />
        ) : (
          filtered.map(p => {
            const stars = p.rating ?? 0;
            const lastUsed = formatDate(lastUsedByProductId.get(p.id) ?? p.last_used_at);
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/products/profile/${p.id}`)}
                className="w-full bg-card border border-border rounded-[14px] p-3.5 flex items-center gap-3 text-left hover:border-primary/40 transition-colors"
              >
                <ProductThumb
                  imageUrl={p.image_url}
                  storagePath={p.storage_path}
                  alt={p.name}
                  cover
                  wrapperClassName="size-12 rounded-[10px] overflow-hidden bg-secondary shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium font-body leading-tight truncate">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Stars n={stars} />
                    {lastUsed && (
                      <span className="text-[10px] text-muted-foreground">· last used {lastUsed}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </ScreenLayout>
  );
};

export default ProductRepository;
