// Brand shelf item editor. Any content change sends the item back into review
// and unpublishes it — the database trigger enforces that, this screen just
// tells the brand it's going to happen.

import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSaveShelfItem, type BrandShelfItem } from "@/hooks/useBrandShelf";

type Form = {
  name: string;
  description: string;
  kind: string;
  tool_kind: string;
  ingredientsText: string;
  featuresText: string;
  materialsText: string;
  external_url: string;
  source_url: string;
  ingredients_source: string;
  source_type: string;
  imageUrls: string[];
  position: number;
};

/** Category tabs. A supplement keeps the ingredient panel (supplement facts);
 *  only a tool swaps it for features and materials. */
const KINDS: { value: string; label: string }[] = [
  { value: "product", label: "Product" },
  { value: "tool", label: "Tool" },
  { value: "supplement", label: "Supplement" },
];

const EMPTY: Form = {
  name: "",
  description: "",
  kind: "product",
  tool_kind: "",
  ingredientsText: "",
  featuresText: "",
  materialsText: "",
  external_url: "",
  source_url: "",
  ingredients_source: "manual",
  source_type: "manual",
  imageUrls: [],
  position: 0,
};

const listToText = (v: string[] | null | undefined) => (v ?? []).join("\n");
const textToList = (v: string) =>
  v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

const BrandShelfProduct = () => {
  const nav = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const isNew = !id || id === "new";
  const save = useSaveShelfItem();

  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(!isNew);

  // Prefill from a scan or a product link.
  useEffect(() => {
    const prefill = (location.state as { prefill?: Record<string, unknown> } | null)?.prefill;
    if (!isNew || !prefill) return;
    setForm((f) => ({
      ...f,
      name: (prefill.name as string) ?? f.name,
      description: (prefill.description as string) ?? f.description,
      ingredientsText: Array.isArray(prefill.ingredients) ? (prefill.ingredients as string[]).join("\n") : f.ingredientsText,
      ingredients_source: (prefill.ingredients_source as string) ?? f.ingredients_source,
      source_type: (prefill.source_type as string) ?? f.source_type,
      source_url: (prefill.source_url as string) ?? f.source_url,
      external_url: (prefill.external_url as string) ?? f.external_url,
      imageUrls: Array.isArray(prefill.image_urls) ? (prefill.image_urls as string[]) : f.imageUrls,
      position: typeof prefill.position === "number" ? prefill.position : f.position,
    }));
  }, [isNew, location.state]);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("brand_products")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Couldn't load that product");
        setLoading(false);
        return;
      }
      const row = data as unknown as BrandShelfItem;
      setForm({
        name: row.name ?? "",
        description: row.description ?? "",
        kind: row.kind ?? "product",
        tool_kind: row.tool_kind ?? "",
        ingredientsText: listToText(row.ingredients),
        featuresText: listToText(row.key_features),
        materialsText: listToText(row.materials),
        external_url: row.external_url ?? "",
        source_url: row.source_url ?? "",
        ingredients_source: row.ingredients_source ?? "manual",
        source_type: row.source_type ?? "manual",
        imageUrls: row.image_urls ?? [],
        position: row.position ?? 0,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, isNew]);

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Give the product a name"); return; }
    try {
      await save.mutateAsync({
        id: isNew ? undefined : id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        kind: form.kind,
        tool_kind: form.kind === "tool" ? (form.tool_kind.trim() || null) : null,
        ingredients: textToList(form.ingredientsText),
        key_features: textToList(form.featuresText),
        materials: textToList(form.materialsText),
        external_url: form.external_url.trim() || null,
        source_url: form.source_url.trim() || null,
        ingredients_source: form.ingredients_source,
        source_type: form.source_type,
        image_urls: form.imageUrls,
        position: form.position,
      });
      toast.success(isNew ? "Sent for review" : "Saved — back in review");
      nav("/brand/shelf");
    } catch {
      /* surfaced by the mutation */
    }
  };

  if (loading) return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar title={isNew ? "New product" : "Edit product"} />
      <div className="px-5 pb-10 space-y-4">
        <SurfaceCard className="p-4 space-y-3">
          <div>
            <Label className="font-body text-[12px]">Product name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label className="font-body text-[12px]">What is it?</Label>
            <div className="mt-1 flex gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  onClick={() => setForm({ ...form, kind: k.value })}
                  className={`px-3 py-1.5 rounded-pill text-[12px] font-body border ${
                    form.kind === k.value ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          {form.kind === "tool" && (
            <div>
              <Label className="font-body text-[12px]">Type of tool</Label>
              <Input value={form.tool_kind} onChange={(e) => setForm({ ...form, tool_kind: e.target.value })} placeholder="Diffuser, wide-tooth comb…" />
            </div>
          )}
          <div>
            <Label className="font-body text-[12px]">Description</Label>
            <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {form.imageUrls.length > 0 && (
            <div>
              <Label className="font-body text-[12px]">Images from the link</Label>
              <div className="mt-1.5 flex gap-2 flex-wrap">
                {form.imageUrls.map((u) => (
                  <div key={u} className="relative">
                    <img
                      src={u}
                      alt={form.name || "Product image"}
                      className="size-[68px] object-cover rounded-[12px] border border-border bg-muted"
                      onError={() =>
                        setForm((f) => ({ ...f, imageUrls: f.imageUrls.filter((x) => x !== u) }))
                      }
                    />
                    <button
                      aria-label="Remove image"
                      onClick={() => setForm({ ...form, imageUrls: form.imageUrls.filter((x) => x !== u) })}
                      className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background border border-border flex items-center justify-center"
                    >
                      <X className="size-3 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] font-body text-muted-foreground leading-snug">
                Pulled from the product page. Remove anything that isn't the product.
              </p>
            </div>
          )}
          <div>
            <Label className="font-body text-[12px]">Where to buy it</Label>
            <Input value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} placeholder="https://" inputMode="url" autoCapitalize="none" />
          </div>
        </SurfaceCard>

        {form.kind !== "tool" ? (
          <div>
            <SectionLabel className="!px-0">Ingredients</SectionLabel>
            <SurfaceCard className="p-4">
              <Textarea
                rows={8}
                value={form.ingredientsText}
                onChange={(e) => setForm({ ...form, ingredientsText: e.target.value, ingredients_source: "manual" })}
                placeholder="One ingredient per line, in order"
              />
              <p className="mt-2 text-[11px] font-body text-muted-foreground leading-snug">
                In INCI order. This is what members' guidance is read from, so it needs to be
                the full list.
              </p>
            </SurfaceCard>
          </div>
        ) : (
          <div>
            <SectionLabel className="!px-0">Details</SectionLabel>
            <SurfaceCard className="p-4 space-y-3">
              <div>
                <Label className="font-body text-[12px]">Key features</Label>
                <Textarea rows={4} value={form.featuresText} onChange={(e) => setForm({ ...form, featuresText: e.target.value })} placeholder="One per line" />
              </div>
              <div>
                <Label className="font-body text-[12px]">Materials</Label>
                <Textarea rows={3} value={form.materialsText} onChange={(e) => setForm({ ...form, materialsText: e.target.value })} placeholder="One per line" />
              </div>
            </SurfaceCard>
          </div>
        )}

        <p className="text-[11.5px] font-body text-muted-foreground leading-snug">
          Everything you add goes to us for a quick check before it appears on your brand page.
          Editing an approved product sends it back for another look.
        </p>

        <Button className="w-full rounded-pill" onClick={submit} disabled={save.isPending}>
          {save.isPending ? <><Loader2 className="size-4 mr-1.5 animate-spin" /> Saving…</> : isNew ? "Send for review" : "Save changes"}
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default BrandShelfProduct;
