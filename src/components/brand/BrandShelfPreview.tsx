// Brand dashboard shelf preview — thumbnails of the brand's permanent shelf
// products, tappable straight through to view/edit each one.
import { useNavigate } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { useBrandShelf } from "@/hooks/useBrandShelf";
import { shelfItemStatus } from "@/lib/brandMetrics";

const BrandShelfPreview = () => {
  const nav = useNavigate();
  const { data: items = [], isLoading } = useBrandShelf();

  return (
    <SurfaceCard className="p-4">
      <button className="w-full text-left" onClick={() => nav("/brand/shelf")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-[15px] leading-tight">Your shelf</p>
            <p className="mt-1 text-[12px] font-body text-muted-foreground leading-snug">
              Your permanent product catalogue. It stays on your brand page between campaigns,
              and members can add from it directly.
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground mt-0.5" />
        </div>
      </button>

      {!isLoading && items.length > 0 && (
        <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => nav(`/brand/shelf/${item.id}`)}
              className="w-[92px] shrink-0 text-left"
            >
              <div className="aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted/40">
                {item.image_urls?.[0] ? (
                  <img
                    src={item.image_urls[0]}
                    alt={item.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-primary/50 font-display text-lg">
                    ✦
                  </div>
                )}
              </div>
              <p className="product-title mt-1 text-[10.5px] font-body leading-snug text-foreground/80">
                {item.name}
              </p>

              <p className="text-[9.5px] font-body text-muted-foreground">
                {shelfItemStatus(item).label}
              </p>
            </button>
          ))}
          <button
            onClick={() => nav("/brand/shelf")}
            className="w-[92px] shrink-0 text-left"
            aria-label="Add a product"
          >
            <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
              <Plus className="size-4" />
            </div>
            <p className="mt-1 text-[10.5px] font-body text-muted-foreground">Add product</p>
          </button>
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <p className="mt-3 text-[11.5px] font-body text-muted-foreground">
          Nothing on your shelf yet — tap to add your first product.
        </p>
      )}
    </SurfaceCard>
  );
};

export default BrandShelfPreview;
