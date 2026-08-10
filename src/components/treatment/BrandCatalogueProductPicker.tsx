import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export interface BrandCataloguePick {
  name: string;
  brand: string | null;
  image_url: string | null;
  brand_user_id: string;
}

interface ListedBrand {
  user_id: string;
  brand_name: string;
  logo_path: string | null;
}

/** Brands that keep a shelf on STRAND — used for the picker and for hyperlinks. */
export function useListedBrands(enabled = true) {
  const q = useQuery({
    queryKey: ["listed-brands"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ListedBrand[]> => {
      const { data, error } = await supabase
        .from("brand_profiles")
        .select("user_id, brand_name, logo_path")
        .eq("hidden_from_directory", false)
        .order("brand_name");
      if (error) throw error;
      return (data ?? []) as ListedBrand[];
    },
  });
  return { brands: q.data ?? [], loading: q.isLoading };
}

/** name (lowercased) → brand user id, so a brand name can become a link. */
export function useBrandLinkMap() {
  const { brands } = useListedBrands();
  return useMemo(() => {
    const m = new Map<string, string>();
    brands.forEach((b) => m.set(b.brand_name.trim().toLowerCase(), b.user_id));
    return m;
  }, [brands]);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (pick: BrandCataloguePick) => void;
}

interface CatalogueRow {
  brand_product_id: string;
  name: string;
  brand: string | null;
  image_url: string | null;
}

/**
 * Picks a product straight from a brand's shelf on STRAND, so a treatment plan
 * can reference what a brand actually sells rather than a retyped name.
 */
const BrandCatalogueProductPicker = ({ open, onOpenChange, onPick }: Props) => {
  const { brands, loading } = useListedBrands(open);
  const [term, setTerm] = useState("");
  const [brandUserId, setBrandUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTerm("");
      setBrandUserId(null);
    }
  }, [open]);

  const chosen = brands.find((b) => b.user_id === brandUserId) ?? null;

  const catalogue = useQuery({
    queryKey: ["brand-catalogue-pick", brandUserId],
    enabled: open && !!brandUserId,
    staleTime: 60_000,
    queryFn: async (): Promise<CatalogueRow[]> => {
      const { data, error } = await supabase.rpc("brand_public_catalogue", {
        _brand_user_id: brandUserId!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as CatalogueRow[];
    },
  });

  const brandList = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.brand_name.toLowerCase().includes(q));
  }, [brands, term]);

  const productList = useMemo(() => {
    const q = term.trim().toLowerCase();
    const rows = catalogue.data ?? [];
    if (!q) return rows;
    return rows.filter((r) => (r.name ?? "").toLowerCase().includes(q));
  }, [catalogue.data, term]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-[20px]">
            {chosen ? chosen.brand_name : "From a brand's shelf"}
          </SheetTitle>
          <SheetDescription className="font-body text-[12.5px]">
            {chosen
              ? "Tap a product to add it to this plan."
              : "Choose a brand listed on STRAND."}
          </SheetDescription>
        </SheetHeader>

        {chosen && (
          <button
            type="button"
            onClick={() => {
              setBrandUserId(null);
              setTerm("");
            }}
            className="mt-2 flex items-center gap-1 font-body text-[12.5px] text-primary min-h-[32px]"
          >
            <ChevronLeft className="size-4" /> All brands
          </button>
        )}

        <div className="relative mt-3">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={chosen ? "Search products" : "Search brands"}
            className="pl-9"
          />
        </div>

        <div className="mt-3 space-y-1.5 pb-6">
          {!chosen &&
            (loading ? (
              <p className="font-body text-[13px] text-muted-foreground">Loading brands…</p>
            ) : brandList.length === 0 ? (
              <p className="font-body text-[13px] text-muted-foreground">No brands match that.</p>
            ) : (
              brandList.map((b) => (
                <button
                  key={b.user_id}
                  type="button"
                  onClick={() => {
                    setBrandUserId(b.user_id);
                    setTerm("");
                  }}
                  className="w-full text-left rounded-2xl border border-border bg-card px-3 py-2.5 min-h-[44px]"
                >
                  <span className="font-body text-[14px] font-semibold break-words">
                    {b.brand_name}
                  </span>
                </button>
              ))
            ))}

          {chosen &&
            (catalogue.isLoading ? (
              <p className="font-body text-[13px] text-muted-foreground">Loading products…</p>
            ) : productList.length === 0 ? (
              <p className="font-body text-[13px] text-muted-foreground">
                This brand hasn't listed any products yet.
              </p>
            ) : (
              productList.map((r) => (
                <button
                  key={r.brand_product_id}
                  type="button"
                  onClick={() => {
                    onPick({
                      name: r.name,
                      brand: r.brand ?? chosen.brand_name,
                      image_url: r.image_url ?? null,
                      brand_user_id: chosen.user_id,
                    });
                    onOpenChange(false);
                  }}
                  className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left min-h-[44px]"
                >
                  <div className="size-10 rounded-xl bg-muted overflow-hidden shrink-0">
                    {r.image_url && (
                      <img
                        src={r.image_url}
                        alt={r.name}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block font-body text-[14px] font-semibold break-words">
                      {r.name}
                    </span>
                    <span className="block font-body text-[12px] text-muted-foreground">
                      {chosen.brand_name}
                    </span>
                  </span>
                </button>
              ))
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default BrandCatalogueProductPicker;
