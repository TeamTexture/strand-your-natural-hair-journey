// Shelf engagement — the brand's own products, independent of any campaign.
//
// Deliberately separate from campaign metrics: these figures are about the
// permanent shelf and stay meaningful when nothing is running. Every number is
// suppressed inside the database below the member floor (see
// public.brand_shelf_engagement); this component only renders what it is given
// and prints one quiet line rather than repeating "Fewer than 50" per row.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import SectionLabel from "@/components/SectionLabel";
import SurfaceCard from "@/components/SurfaceCard";
import {
  useBrandShelfEngagement,
  shelfEngagementTotals,
  type ShelfEngagementRow,
} from "@/hooks/useBrandProductEngagement";

const Figure = ({ label, value }: { label: string; value: number | null }) => (
  <div className="min-w-0">
    <p className="font-display text-[17px] leading-none">{value == null ? "—" : value}</p>
    <p className="mt-1 text-[10.5px] font-body text-muted-foreground leading-snug">{label}</p>
  </div>
);

const rowFigures = (r: {
  shelf_count: number | null;
  wishlist_count: number | null;
  favourite_count: number | null;
  expands: number | null;
  code_copies: number | null;
  link_clicks: number | null;
}) => [
  { label: "Added to shelves", value: r.shelf_count },
  { label: "Added to wishlists", value: r.wishlist_count },
  { label: "Marked favourite", value: r.favourite_count },
  { label: "Card expanded", value: r.expands },
  { label: "Code copied", value: r.code_copies },
  { label: "Buy link clicked", value: r.link_clicks },
];

const ProductRow = ({ row }: { row: ShelfEngagementRow }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[12px] border border-border/70 bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-3 text-left"
      >
        <span className="flex-1 min-w-0 font-body text-[13px] leading-snug [overflow-wrap:anywhere] line-clamp-2">
          {row.name}
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 grid grid-cols-3 gap-x-2 gap-y-3">
          {rowFigures(row).map((f) => (
            <Figure key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
      )}
    </div>
  );
};

const ShelfEngagementSection = () => {
  const { data: rows = [], isLoading } = useBrandShelfEngagement();
  if (isLoading || rows.length === 0) return null;

  const totals = shelfEngagementTotals(rows);
  const anySuppressed = rows.some((r) => r.suppressed);
  const threshold = rows[0]?.min_threshold ?? 50;

  return (
    <div>
      <SectionLabel className="!px-0">Shelf engagement</SectionLabel>
      <p className="text-[11px] text-muted-foreground font-body -mt-1 mb-1.5 leading-snug">
        How members are engaging with your permanent shelf. Separate from campaign metrics — these
        keep counting between runs.
      </p>
      <SurfaceCard className="space-y-3">
        <div className="grid grid-cols-3 gap-x-2 gap-y-3">
          {rowFigures(totals).map((f) => (
            <Figure key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
        <div className="space-y-1.5 pt-1">
          {rows.map((r) => (
            <ProductRow key={r.brand_product_id} row={r} />
          ))}
        </div>
        {anySuppressed && (
          <p className="text-[11px] font-body text-muted-foreground leading-snug">
            Figures appear once at least {threshold} members are behind them. You always see counts,
            never individual members.
          </p>
        )}
      </SurfaceCard>
    </div>
  );
};

export default ShelfEngagementSection;
