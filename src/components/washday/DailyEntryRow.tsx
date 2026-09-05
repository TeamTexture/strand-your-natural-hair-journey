// HISTORY — a between-wash entry, sitting in the same timeline as her wash days
// but deliberately smaller and clearly labelled, so it can never be mistaken
// for a full wash day (and it isn't counted as one anywhere).

import { Link } from "react-router-dom";
import { Droplets } from "lucide-react";
import ProductThumb from "@/components/ProductThumb";
import type { DailyHairEntry } from "@/hooks/useDailyHairEntries";
import type { UserProduct } from "@/hooks/useUserProducts";

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" });

const DailyEntryRow = ({
  entry,
  byId,
}: {
  entry: DailyHairEntry;
  byId: Record<string, UserProduct>;
}) => (
  <div className="rounded-[14px] border border-border border-dashed bg-card p-3">
    <div className="flex items-center gap-2">
      <Droplets className="size-3.5 text-primary shrink-0" aria-hidden />
      <span className="text-[10px] uppercase tracking-[0.16em] text-primary font-medium">
        Between washes
      </span>
      <span className="font-body text-[11.5px] text-muted-foreground">{dayLabel(entry.entry_date)}</span>
    </div>

    <div className="mt-2 space-y-1.5">
      {(entry.product_ids ?? []).map((id) => {
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
      {entry.note && (
        <p className="font-body text-[12px] leading-snug text-foreground/80">{entry.note}</p>
      )}
    </div>
  </div>
);

export default DailyEntryRow;
