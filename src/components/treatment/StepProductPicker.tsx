import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Link2, Loader2, Plus, Store, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SectionLabel from "@/components/SectionLabel";
import DualPhotoCaptureSheet from "@/components/DualPhotoCaptureSheet";
import ShelfProductPicker from "@/components/treatment/ShelfProductPicker";
import BrandCatalogueProductPicker from "@/components/treatment/BrandCatalogueProductPicker";
import { usePlanProductLink } from "@/hooks/usePlanProductLink";
import { useProductScan } from "@/hooks/useProductScan";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface PlanProductRow {
  id: string;
  product_name: string;
  brand: string | null;
  image_url: string | null;
  user_product_id: string | null;
}

interface Props {
  planId: string;
  /** treatment_plan_products.id currently attached to this step. */
  value: string | null;
  onChange: (productId: string | null) => void;
  disabled?: boolean;
}

/**
 * The product this step uses. She can pull one off her shelf, take one from a
 * brand's shelf on STRAND, paste a link, or scan the bottle — anything new
 * lands on her shelf as well, so the step and the shelf stay in step.
 */
const StepProductPicker = ({ planId, value, onChange, disabled }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { resolveLink, busy: linkBusy } = usePlanProductLink();
  const { startScan, busy: scanBusy } = useProductScan();

  const [shelfOpen, setShelfOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: planProducts = [] } = useQuery({
    queryKey: ["plan-products-picker", planId],
    enabled: !!planId,
    queryFn: async (): Promise<PlanProductRow[]> => {
      const { data, error } = await db
        .from("treatment_plan_products")
        .select("id, product_name, brand, image_url, user_product_id")
        .eq("plan_id", planId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanProductRow[];
    },
  });

  const selected = planProducts.find((p) => p.id === value) ?? null;
  const busy = saving || linkBusy || scanBusy;

  /** Reuse a matching plan product when there is one, otherwise create it. */
  const attach = async (row: {
    product_name: string;
    brand: string | null;
    image_url: string | null;
    user_product_id: string | null;
  }) => {
    const existing = planProducts.find((p) =>
      row.user_product_id
        ? p.user_product_id === row.user_product_id
        : p.product_name.trim().toLowerCase() === row.product_name.trim().toLowerCase(),
    );
    if (existing) {
      onChange(existing.id);
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await db
        .from("treatment_plan_products")
        .insert({
          plan_id: planId,
          product_name: row.product_name,
          brand: row.brand,
          image_url: row.image_url,
          user_product_id: row.user_product_id,
          step_order: planProducts.length,
        })
        .select("id")
        .single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["plan-products-picker", planId] });
      onChange(data.id as string);
      toast.success(`${row.product_name} attached to this step`);
    } catch (e) {
      console.error("attach step product failed", e);
      toast.error("Couldn't attach that product. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const addFromLink = async () => {
    const resolved = await resolveLink(linkUrl);
    if (!resolved) return;
    setLinkUrl("");
    setLinkOpen(false);
    await attach({
      product_name: resolved.name,
      brand: resolved.brand,
      image_url: resolved.image_url,
      user_product_id: resolved.id,
    });
  };

  const optionClass = "flex-1 rounded-pill min-h-[38px] px-2.5 font-body text-[12px]";

  return (
    <div className="space-y-2">
      <SectionLabel className="px-0 mt-0 mb-1.5">Product for this step</SectionLabel>

      {selected ? (
        <div className="flex items-center gap-2.5 rounded-[12px] border border-border bg-card px-2.5 py-2">
          <div className="size-9 rounded-[8px] bg-muted overflow-hidden shrink-0">
            {selected.image_url && (
              <img
                src={selected.image_url}
                alt={selected.product_name}
                className="size-full object-cover"
                loading="lazy"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-body text-[13px] font-medium leading-snug break-words">
              {selected.product_name}
            </p>
            {selected.brand && (
              <p className="font-body text-[11px] text-muted-foreground break-words">
                {selected.brand}
              </p>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Remove this product from the step"
              className="text-muted-foreground min-h-[32px] px-1"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <p className="font-body text-[12px] text-muted-foreground">
          Optional — attach the product she reaches for at this step.
        </p>
      )}

      {!disabled && (
        <>
          {planProducts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {planProducts
                .filter((p) => p.id !== value)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChange(p.id)}
                    className="rounded-pill border border-border bg-card px-3 py-1.5 font-body text-[12px] max-w-full truncate"
                  >
                    {p.product_name}
                  </button>
                ))}
            </div>
          )}

          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              className={optionClass}
              disabled={busy}
              onClick={() => setShelfOpen(true)}
            >
              <Plus className="size-3.5 mr-1" /> Shelf
            </Button>
            <Button
              type="button"
              variant="outline"
              className={optionClass}
              disabled={busy}
              onClick={() => setBrandOpen(true)}
            >
              <Store className="size-3.5 mr-1" /> Brand
            </Button>
          </div>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              className={optionClass}
              disabled={busy}
              onClick={() => setLinkOpen(true)}
            >
              <Link2 className="size-3.5 mr-1" /> Link
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(optionClass)}
              disabled={busy}
              onClick={() => setScanOpen(true)}
            >
              {scanBusy ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <Camera className="size-3.5 mr-1" />
              )}
              Scan
            </Button>
          </div>
        </>
      )}

      <ShelfProductPicker
        open={shelfOpen}
        onOpenChange={setShelfOpen}
        onPick={(prod) => {
          setShelfOpen(false);
          void attach({
            product_name: prod.name,
            brand: prod.brand ?? null,
            image_url: prod.image_url ?? null,
            user_product_id: prod.id,
          });
        }}
      />

      <BrandCatalogueProductPicker
        open={brandOpen}
        onOpenChange={setBrandOpen}
        onPick={(pick) =>
          void attach({
            product_name: pick.name,
            brand: pick.brand,
            image_url: pick.image_url,
            user_product_id: null,
          })
        }
      />

      <DualPhotoCaptureSheet
        open={scanOpen}
        onOpenChange={setScanOpen}
        busy={scanBusy}
        preferCamera
        onSubmit={async (front, back) => {
          setScanOpen(false);
          toast.info("Save your step first — the scanned product lands on your shelf.");
          await startScan(front, back, "shelf", {
            auto_save: true,
            returnTo: location.pathname,
          });
        }}
      />

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-[330px] rounded-3xl">
          <DialogHeader className="text-left">
            <DialogTitle className="font-display text-[19px]">Add by link</DialogTitle>
            <DialogDescription className="font-body text-[12.5px]">
              Paste a product page link. It's analysed and saved to your shelf too.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://"
            inputMode="url"
          />
          <Button
            variant="gold"
            className="rounded-pill w-full"
            disabled={linkBusy}
            onClick={() => void addFromLink()}
          >
            {linkBusy ? (
              <>
                <Loader2 className="size-4 mr-1.5 animate-spin" /> Reading the page…
              </>
            ) : (
              "Add to this step"
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StepProductPicker;
