// WASH DAY LOG — what she did between washes, so she isn't reconstructing a
// fortnight from memory.
//
// Read-only and collapsible: it never pre-fills or rewrites the wash-day steps
// (favourites remain the only thing that pre-fills a log), and it never touches
// a saved entry. Collapsed to a single summary line by default.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import ProductThumb from "@/components/ProductThumb";
import { useDailyHairEntries } from "@/hooks/useDailyHairEntries";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useWashDays } from "@/hooks/useWashDays";
import { cn } from "@/lib/utils";

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

const SinceLastWashCard = () => {
  const { last } = useWashDays({ static: true });
  const { entries } = useDailyHairEntries();
  const { products } = useUserProducts("all", { static: true });
  const [open, setOpen] = useState(false);

  const since = useMemo(() => {
    const lastDate = last?.wash_date ?? null;
    return entries.filter((e) => !lastDate || e.entry_date > lastDate);
  }, [entries, last]);

  if (!since.length) return null;

  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const productCount = new Set(since.flatMap((e) => e.product_ids ?? [])).size;

  return (
    <div className="px-5 pb-3">
      <div className="rounded-[14px] border border-border bg-card overflow-hidden">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 p-3 text-left min-h-[48px]"
        >
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-primary font-medium">
              Since your last wash
            </span>
            <span className="block font-body text-[12.5px] text-foreground/80">
              {since.length} {since.length === 1 ? "entry" : "entries"}
              {productCount > 0 && `, ${productCount} ${productCount === 1 ? "product" : "products"} used`}
            </span>
          </span>
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>

        {open && (
          <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
            {since.map((e) => (
              <div key={e.id}>
                <p className="font-body text-[11.5px] text-muted-foreground">{dayLabel(e.entry_date)}</p>
                <div className="mt-1 space-y-1.5">
                  {(e.product_ids ?? []).map((id) => {
                    const p = byId[id];
                    if (!p) return null;
                    return (
                      <div key={id} className="flex items-center gap-2.5">
                        <ProductThumb
                          imageUrl={p.image_url}
                          storagePath={p.storage_path}
                          alt={p.name}
                          cover
                          wrapperClassName="size-[28px] rounded-[7px] overflow-hidden bg-secondary shrink-0"
                        />
                        <Link
                          to={`/products/profile/${p.id}`}
                          className="product-title text-[12.5px] leading-snug break-words [overflow-wrap:anywhere] underline decoration-primary/40 underline-offset-2"
                        >
                          {p.name}
                        </Link>
                      </div>
                    );
                  })}
                  {e.note && (
                    <p className="font-body text-[12px] leading-snug text-foreground/80">{e.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SinceLastWashCard;
