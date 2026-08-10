import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link2, Loader2, Plus, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import BrandTagList from "@/components/brand/BrandTagList";
import ShelfProductPicker from "@/components/treatment/ShelfProductPicker";
import BrandCatalogueProductPicker, {
  useBrandLinkMap,
} from "@/components/treatment/BrandCatalogueProductPicker";
import { usePlanProductLink } from "@/hooks/usePlanProductLink";

export interface PlanProduct {
  id: string;
  product_name: string;
  brand: string | null;
  usage_notes: string | null;
  image_url: string | null;
  user_product_id: string | null;
}

interface Props {
  planId: string;
  products: PlanProduct[];
  /** Read-only plans (assigned, not owned) hide the add/remove controls. */
  canEdit?: boolean;
  onChanged: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * The products a plan uses. Members can pull one off their own shelf, pick one
 * from a brand's shelf on STRAND, or paste a link — and a brand name that
 * belongs to a listed brand becomes a link through to that brand.
 */
const PlanProductsSection = ({ planId, products, canEdit = true, onChanged }: Props) => {
  const navigate = useNavigate();
  const brandLinks = useBrandLinkMap();
  const { resolveLink, busy } = usePlanProductLink();
  const [shelfOpen, setShelfOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async (row: {
    product_name: string;
    brand: string | null;
    image_url: string | null;
    user_product_id: string | null;
  }) => {
    setSaving(true);
    try {
      const { error } = await db.from("treatment_plan_products").insert({
        plan_id: planId,
        product_name: row.product_name,
        brand: row.brand,
        image_url: row.image_url,
        user_product_id: row.user_product_id,
        step_order: products.length,
      });
      if (error) throw error;
      toast.success(`${row.product_name} added to this plan`);
      onChanged();
    } catch (e) {
      console.error("add plan product failed", e);
      toast.error("Couldn't add that product. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const { error } = await db.from("treatment_plan_products").delete().eq("id", id);
      if (error) throw error;
      onChanged();
    } catch (e) {
      console.error("remove plan product failed", e);
      toast.error("Couldn't remove that product.");
    }
  };

  const addFromLink = async () => {
    const resolved = await resolveLink(linkUrl);
    if (!resolved) return;
    setLinkUrl("");
    setLinkOpen(false);
    await add({
      product_name: resolved.name,
      brand: resolved.brand,
      image_url: resolved.image_url,
      user_product_id: resolved.id,
    });
  };

  const brandUserIdFor = (brand: string | null) =>
    brand ? brandLinks.get(brand.trim().toLowerCase()) ?? null : null;

  return (
    <div className="space-y-2">
      <SectionLabel className="px-0 mt-0 mb-1.5">Products</SectionLabel>

      {products.length === 0 && (
        <p className="font-body text-[13px] text-muted-foreground">
          No products on this plan yet.
        </p>
      )}

      <div className="space-y-1.5">
        {products.map((p) => {
          const brandUserId = brandUserIdFor(p.brand);
          return (
            <SurfaceCard key={p.id} className="space-y-0.5">
              <div className="flex items-start gap-3">
                {(p.image_url || p.user_product_id) && (
                  <div className="size-11 rounded-xl bg-muted overflow-hidden shrink-0">
                    {p.image_url && (
                      <img
                        src={p.image_url}
                        alt={p.product_name}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-body text-[14px] font-semibold break-words">
                    {p.product_name}
                  </p>
                  {p.brand &&
                    (brandUserId ? (
                      <button
                        type="button"
                        onClick={() => navigate(`/brands/${brandUserId}`)}
                        className="font-body text-[12px] text-primary underline underline-offset-2 break-words text-left"
                      >
                        {p.brand}
                      </button>
                    ) : (
                      <p className="font-body text-[12px] text-muted-foreground break-words">
                        {p.brand}
                      </p>
                    ))}
                  {p.user_product_id && (
                    <button
                      type="button"
                      onClick={() => navigate(`/products/profile/${p.user_product_id}`)}
                      className="block font-body text-[12px] text-primary underline underline-offset-2 mt-0.5"
                    >
                      Open on your shelf
                    </button>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void remove(p.id)}
                    className="text-muted-foreground min-h-[32px]"
                    aria-label={`Remove ${p.product_name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              {p.usage_notes && (
                <p className="font-body text-[13px] text-muted-foreground leading-snug pt-1 [overflow-wrap:anywhere]">
                  {p.usage_notes}
                </p>
              )}
              <BrandTagList taggableType="treatment_plan_product" taggableId={p.id} />
            </SurfaceCard>
          );
        })}
      </div>

      {canEdit && (
        <div className="space-y-1.5 pt-1">
          <Button
            variant="outline"
            className="w-full rounded-pill"
            disabled={saving}
            onClick={() => setShelfOpen(true)}
          >
            <Plus className="size-4 mr-1.5" /> From your shelf
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-pill"
            disabled={saving}
            onClick={() => setBrandOpen(true)}
          >
            <Store className="size-4 mr-1.5" /> From a brand's shelf
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-pill"
            disabled={saving}
            onClick={() => setLinkOpen(true)}
          >
            <Link2 className="size-4 mr-1.5" /> Add by link
          </Button>
        </div>
      )}

      <ShelfProductPicker
        open={shelfOpen}
        onOpenChange={setShelfOpen}
        usedIds={products.map((p) => p.user_product_id).filter(Boolean) as string[]}
        onPick={(prod) => {
          setShelfOpen(false);
          void add({
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
          void add({
            product_name: pick.name,
            brand: pick.brand,
            image_url: pick.image_url,
            user_product_id: null,
          })
        }
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
            autoCapitalize="none"
          />
          <Button
            className="w-full rounded-pill"
            disabled={busy || saving}
            onClick={() => void addFromLink()}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 mr-1.5 animate-spin" /> Reading the link…
              </>
            ) : (
              "Add product"
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlanProductsSection;
