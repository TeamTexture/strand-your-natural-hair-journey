import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { BRAND_CATEGORIES } from "@/lib/brandCategories";

interface BrandCard {
  user_id: string;
  brand_name: string;
  category: string | null;
  about: string | null;
  website: string | null;
  logo_path: string | null;
  live_offers: number;
}

const BrandsDirectory = () => {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ["consumer", "brands-directory"],
    queryFn: async (): Promise<BrandCard[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const [brandsRes, offersRes] = await Promise.all([
        supabase.from("brand_profiles").select("user_id, brand_name, category, about, website, logo_path").order("brand_name"),
        supabase
          .from("brand_offers")
          .select("brand_user_id")
          .in("status", ["live", "paid_scheduled"])
          .lte("starts_on", today)
          .gte("ends_on", today),
      ]);
      const liveMap = new Map<string, number>();
      (offersRes.data ?? []).forEach((o) => liveMap.set(o.brand_user_id, (liveMap.get(o.brand_user_id) ?? 0) + 1));
      return (brandsRes.data ?? []).map((b) => ({
        user_id: b.user_id,
        brand_name: b.brand_name ?? "Untitled",
        category: (b as { category?: string | null }).category ?? null,
        about: (b as { about?: string | null }).about ?? null,
        website: b.website ?? null,
        logo_path: b.logo_path ?? null,
        live_offers: liveMap.get(b.user_id) ?? 0,
      }));
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return brands.filter((b) => {
      if (cat && (b.category ?? "") !== cat) return false;
      if (!term) return true;
      return b.brand_name.toLowerCase().includes(term) || (b.category ?? "").toLowerCase().includes(term);
    });
  }, [brands, q, cat]);

  return (
    <ScreenLayout>
      <TitleBar title="STRAND Brands" onBack={() => nav(-1)} />
      <div className="px-5 pb-8 space-y-3">
        <p className="text-xs text-muted-foreground font-body leading-snug">
          Brands trusted enough to sit alongside your STRAND journey.
        </p>
        <div className="relative">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search brands…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setCat(null)}
            className={cn(
              "text-[10.5px] uppercase tracking-[0.14em] px-2.5 py-1 rounded-full font-body",
              cat === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            All
          </button>
          {BRAND_CATEGORIES.map((c) => {
            const n = brands.filter((b) => (b.category ?? "") === c).length;
            if (n === 0) return null;
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={cn(
                  "text-[10.5px] uppercase tracking-[0.14em] px-2.5 py-1 rounded-full font-body",
                  cat === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {c}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <LoadingDot />
        ) : filtered.length === 0 ? (
          <EmptyState icon="✦" message="No brands yet" tone="card" />
        ) : (
          <div className="space-y-2">
            {filtered.map((b) => (
              <SurfaceCard key={b.user_id} onClick={() => nav(`/brands/${b.user_id}`)} className="cursor-pointer hover:border-primary/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[15px] leading-tight truncate">{b.brand_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {b.category ?? "Brand"}
                      {b.live_offers > 0 ? ` · ${b.live_offers} live offer${b.live_offers === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                  {b.live_offers > 0 && (
                    <span className="text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full bg-good/15 text-good font-body font-semibold shrink-0">
                      Live
                    </span>
                  )}
                </div>
              </SurfaceCard>
            ))}
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default BrandsDirectory;
