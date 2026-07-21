import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles, Image as ImageIcon, Trash2, Loader2, Plus } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PlacementCalendarPicker from "@/components/PlacementCalendarPicker";
import BannerPreview from "@/components/brand/BannerPreview";
import ImageCropDialog from "@/components/brand/ImageCropDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PlacementSlot, SLOT_LABEL, usePlacementRates, useBrandOffer } from "@/hooks/useBrandOffers";
import { useQueryClient } from "@tanstack/react-query";
import { useBrandSubscription } from "@/hooks/useBrandSubscription";

const SLOTS: PlacementSlot[] = ["home", "products", "wash_day"];
const money = (p: number) => `£${(p / 100).toFixed(2)}`;

type AttachKind = "product" | "tool";

interface ProductDraft {
  id?: string;
  kind: AttachKind;
  name: string;
  description: string;
  external_url: string;
  image_urls: string[];
  ingredients: string[];       // product-only
  tool_kind: string | null;    // tool-only
  key_features: string[];      // tool-only
  materials: string[];         // tool-only
  source_type: "manual" | "ai" | "linked";
  source_url?: string | null;
  linked_product_id?: string | null;
}

const emptyProduct = (kind: AttachKind = "product"): ProductDraft => ({
  kind,
  name: "",
  description: "",
  external_url: "",
  image_urls: [],
  ingredients: [],
  tool_kind: null,
  key_features: [],
  materials: [],
  source_type: "manual",
});

// Same tool_kind vocabulary the AI scrape returns / that MyToolsSection recognises.
const TOOL_KINDS: { value: string; label: string }[] = [
  { value: "brush", label: "Brush" },
  { value: "comb", label: "Comb" },
  { value: "bonnet", label: "Bonnet / silk scarf" },
  { value: "heat_cap", label: "Heat cap (e.g. TT Heat Hat)" },
  { value: "hair_dryer", label: "Hair dryer" },
  { value: "diffuser", label: "Diffuser" },
  { value: "flat_iron", label: "Flat iron" },
  { value: "curling_wand", label: "Curling wand" },
  { value: "pillowcase", label: "Satin pillowcase" },
  { value: "microfibre_towel", label: "Microfibre / T-shirt towel" },
  { value: "sectioning_clips", label: "Sectioning clips" },
  { value: "scissors", label: "Scissors" },
  { value: "other", label: "Other" },
];

const BrandCreateOffer = () => {
  const { id: existingId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rates } = usePlacementRates();
  const { data: existing } = useBrandOffer(existingId);

  const [headline, setHeadline] = useState(existing?.headline ?? "");
  const [bodyCopy, setBodyCopy] = useState(existing?.body_copy ?? "");
  const [discountCode, setDiscountCode] = useState(existing?.discount_code ?? "");
  const [externalUrl, setExternalUrl] = useState(existing?.external_url ?? "");
  const [heroPath, setHeroPath] = useState<string | null>(existing?.hero_image_path ?? null);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [products, setProducts] = useState<ProductDraft[]>(
    (existing?.brand_products ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      external_url: p.external_url ?? "",
      image_urls: p.image_urls ?? [],
      ingredients: p.ingredients ?? [],
      source_type: (p.source_type as ProductDraft["source_type"]) ?? "manual",
      source_url: p.source_url,
      linked_product_id: p.linked_product_id,
    })),
  );
  const [selectedByslot, setSelectedByslot] = useState<Record<PlacementSlot, string[]>>(() => {
    const map: Record<PlacementSlot, string[]> = { home: [], products: [], wash_day: [] };
    (existing?.brand_offer_placements ?? []).forEach((p) => {
      map[p.slot as PlacementSlot].push(p.placement_date);
    });
    return map;
  });
  const [activeSlot, setActiveSlot] = useState<PlacementSlot>("home");
  const [month, setMonth] = useState(() => new Date());
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewMode, setPreviewMode] = useState<"collapsed" | "expanded">("collapsed");

  // Cropper state — one dialog reused for banner or a specific product image.
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropTarget, setCropTarget] = useState<{ kind: "banner" } | { kind: "product"; index: number } | null>(null);

  const heroPreview = useHeroPreview(heroPath);

  const total = useMemo(() => {
    if (!rates) return 0;
    return SLOTS.reduce((sum, s) => sum + selectedByslot[s].length * rates[s], 0);
  }, [selectedByslot, rates]);

  const totalDays = SLOTS.reduce((n, s) => n + selectedByslot[s].length, 0);

  const toggleDate = (slot: PlacementSlot, date: string) => {
    setSelectedByslot((prev) => ({
      ...prev,
      [slot]: prev[slot].includes(date)
        ? prev[slot].filter((d) => d !== date)
        : [...prev[slot], date],
    }));
  };

  const uploadBlob = async (blob: Blob, prefix: string): Promise<string> => {
    if (!user) throw new Error("Not signed in");
    const path = `${user.id}/${prefix}-${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage
      .from("brand-assets")
      .upload(path, blob, { upsert: false, contentType: "image/webp" });
    if (error) throw error;
    return path;
  };

  const signPath = async (path: string): Promise<string | null> => {
    const { data } = await supabase.storage.from("brand-assets").createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  };

  const onBannerFilePicked = (file: File) => {
    setCropTarget({ kind: "banner" });
    setCropFile(file);
  };

  const onProductFilePicked = (index: number, file: File) => {
    setCropTarget({ kind: "product", index });
    setCropFile(file);
  };

  const onCropped = async (blob: Blob) => {
    const target = cropTarget;
    setCropFile(null);
    setCropTarget(null);
    if (!target) return;
    try {
      if (target.kind === "banner") {
        setUploadingHero(true);
        const path = await uploadBlob(blob, "banner");
        setHeroPath(path);
      } else {
        const path = await uploadBlob(blob, "product");
        const url = await signPath(path);
        if (!url) throw new Error("Could not sign uploaded image");
        setProducts((prev) =>
          prev.map((p, i) => (i === target.index ? { ...p, image_urls: [url, ...p.image_urls] } : p)),
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingHero(false);
    }
  };

  const runScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke("brand-product-scrape", {
        body: { url: scrapeUrl.trim() },
      });
      if (error) throw error;
      const p = data?.product;
      if (!p) throw new Error("No product data returned");
      setProducts((prev) => [
        ...prev,
        {
          name: p.name ?? "",
          description: p.description ?? "",
          external_url: p.external_url ?? scrapeUrl,
          image_urls: p.image_urls ?? [],
          ingredients: p.ingredients ?? [],
          source_type: "ai",
          source_url: scrapeUrl,
        },
      ]);
      setScrapeUrl("");
      toast.success("Product draft added — review and edit below");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scrape failed");
    } finally {
      setScraping(false);
    }
  };

  const { isActive: brandSubActive } = useBrandSubscription();

  const firstProduct = products[0];
  const firstProductImage = firstProduct?.image_urls?.[0] ?? null;

  const submit = async (asDraft: boolean) => {
    if (!user) return;
    if (!headline.trim()) return toast.error("Add a headline.");
    if (!asDraft && !heroPath) return toast.error("Upload a banner image (1500×320) before submitting.");
    if (!asDraft && totalDays === 0) return toast.error("Select at least one placement date.");
    if (!asDraft && !brandSubActive) {
      toast("Annual brand membership required to submit for review.");
      nav(`/brand/subscribe?next=${encodeURIComponent(`/brand/offers/${existingId ?? "new"}`)}`);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        brand_user_id: user.id,
        headline: headline.trim(),
        body_copy: bodyCopy.trim() || null,
        discount_code: discountCode.trim() || null,
        external_url: externalUrl.trim() || null,
        hero_image_path: heroPath,
        status: (asDraft ? "draft" : "under_review") as "draft" | "under_review",
        submitted_at: asDraft ? null : new Date().toISOString(),
        total_price_pence: total,
        starts_on: null as string | null,
        ends_on: null as string | null,
      };
      const allDates = SLOTS.flatMap((s) => selectedByslot[s]).sort();
      if (allDates.length > 0) {
        payload.starts_on = allDates[0];
        payload.ends_on = allDates[allDates.length - 1];
      }

      let offerId = existingId;
      if (offerId) {
        const { error } = await supabase.from("brand_offers").update(payload).eq("id", offerId);
        if (error) throw error;
        await supabase.from("brand_offer_placements").delete().eq("offer_id", offerId);
        await supabase.from("brand_products").delete().eq("offer_id", offerId);
      } else {
        const { data, error } = await supabase.from("brand_offers").insert(payload).select("id").single();
        if (error) throw error;
        offerId = data.id;
      }

      const placementRows = SLOTS.flatMap((s) =>
        selectedByslot[s].map((d) => ({
          offer_id: offerId!,
          slot: s,
          placement_date: d,
          daily_rate_pence: rates?.[s] ?? 0,
        })),
      );
      if (placementRows.length > 0) {
        const { error } = await supabase.from("brand_offer_placements").insert(placementRows);
        if (error) throw error;
      }

      if (products.length > 0) {
        const productRows = products.map((p, i) => ({
          offer_id: offerId!,
          name: p.name || "Untitled product",
          description: p.description || null,
          external_url: p.external_url || null,
          image_urls: p.image_urls,
          ingredients: p.ingredients,
          source_type: p.source_type,
          source_url: p.source_url ?? null,
          linked_product_id: p.linked_product_id ?? null,
          position: i,
        }));
        const { error } = await supabase.from("brand_products").insert(productRows);
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ["brand-offers"] });
      qc.invalidateQueries({ queryKey: ["brand-offer", offerId] });
      toast.success(asDraft ? "Saved as draft" : "Submitted for review");
      nav("/brand");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (existingId && !existing) return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar title={existingId ? "Edit offer" : "Create offer"} onBack={() => nav("/brand")} />
      <div className="px-5 pb-32 space-y-5">
        <SectionLabel className="!px-0 !mt-0">Creative</SectionLabel>
        <SurfaceCard className="space-y-3">
          <div>
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Headline *</Label>
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. 10% off your first filter" maxLength={80} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Body copy</Label>
            <Textarea value={bodyCopy} onChange={(e) => setBodyCopy(e.target.value)} placeholder="Why should STRAND members care?" rows={3} maxLength={280} />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Discount code</Label>
            <Input value={discountCode} onChange={(e) => setDiscountCode(e.target.value)} placeholder="STRAND10" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Offer URL</Label>
            <Input type="url" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://" />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Banner image *</Label>
            <p className="text-[11px] text-muted-foreground font-body mt-0.5 leading-snug">
              1500×320px (4.7:1). Keep the focal point in the RIGHT third — your headline
              renders on the left. <span className="font-medium">No text in the image:</span> headline, copy
              and discount code come from the fields above.
            </p>
            <label className="flex items-center gap-2 mt-2 p-3 rounded-lg border border-dashed border-border cursor-pointer hover:border-primary/50">
              <ImageIcon className="size-4 text-muted-foreground" />
              <span className="text-[12px] font-body text-muted-foreground flex-1">
                {uploadingHero ? "Uploading…" : heroPath ? "Replace banner image" : "Upload banner image (JPG/PNG/WebP up to 2MB)"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onBannerFilePicked(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </SurfaceCard>

        <SectionLabel className="!px-0">Live preview</SectionLabel>
        <div className="flex gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => setPreviewMode("collapsed")}
            className={`px-3 py-1 rounded-pill border ${previewMode === "collapsed" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}
          >
            Collapsed strip
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode("expanded")}
            className={`px-3 py-1 rounded-pill border ${previewMode === "expanded" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}
          >
            Expanded
          </button>
        </div>
        <div className="rounded-[12px] bg-muted/40 p-3">
          <BannerPreview
            heroUrl={heroPreview}
            headline={headline}
            bodyCopy={bodyCopy}
            discountCode={discountCode}
            productName={firstProduct?.name}
            productImageUrl={firstProductImage}
            expanded={previewMode === "expanded"}
          />
        </div>

        <SectionLabel className="!px-0">Attach products</SectionLabel>
        <SurfaceCard className="space-y-3">
          <div>
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3 text-primary" /> AI product page
            </Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Paste a product URL — we'll draft a STRAND product page you can edit.
            </p>
            <div className="flex gap-2 mt-1.5">
              <Input value={scrapeUrl} onChange={(e) => setScrapeUrl(e.target.value)} placeholder="https://" />
              <Button type="button" variant="outline" size="pill" onClick={runScrape} disabled={scraping || !scrapeUrl.trim()}>
                {scraping ? <Loader2 className="size-4 animate-spin" /> : "Draft"}
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setProducts((p) => [...p, emptyProduct()])}
            className="text-[12px] text-primary underline underline-offset-2"
          >
            + Add product manually
          </button>
        </SurfaceCard>

        {products.map((p, i) => (
          <SurfaceCard key={i} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body">
                Product {i + 1} · {p.source_type === "ai" ? "AI draft" : "Manual"}
              </p>
              <button
                type="button"
                onClick={() => setProducts((prev) => prev.filter((_, x) => x !== i))}
                className="text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Product image (1:1, min 800×800)</Label>
              <div className="flex gap-2 mt-1 items-start">
                <div className="size-16 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
                  {p.image_urls[0] && <img src={p.image_urls[0]} alt="" className="w-full h-full object-cover" />}
                </div>
                <label className="flex-1 flex items-center gap-2 p-2 rounded-lg border border-dashed border-border cursor-pointer hover:border-primary/50">
                  <Plus className="size-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-body text-muted-foreground">
                    {p.image_urls[0] ? "Replace image" : "Upload square image"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onProductFilePicked(i, f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <Input
              value={p.name}
              onChange={(e) => setProducts((prev) => prev.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
              placeholder="Product name"
            />
            <Textarea
              value={p.description}
              onChange={(e) => setProducts((prev) => prev.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x))}
              placeholder="Description"
              rows={3}
            />
            <Input
              value={p.external_url}
              onChange={(e) => setProducts((prev) => prev.map((x, xi) => xi === i ? { ...x, external_url: e.target.value } : x))}
              placeholder="Buy URL"
            />
            <Textarea
              value={p.ingredients.join(", ")}
              onChange={(e) => setProducts((prev) => prev.map((x, xi) => xi === i ? { ...x, ingredients: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } : x))}
              placeholder="Ingredients (comma-separated)"
              rows={2}
            />
          </SurfaceCard>
        ))}

        <SectionLabel className="!px-0">Placements &amp; calendar</SectionLabel>
        <div className="grid grid-cols-3 gap-1.5">
          {SLOTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveSlot(s)}
              className={`p-2 rounded-lg border text-left transition-colors ${
                activeSlot === s ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <p className="text-[10px] font-body font-medium leading-tight">{SLOT_LABEL[s]}</p>
              <p className="text-[10px] text-muted-foreground">
                {rates ? money(rates[s]) : "…"}/day
              </p>
              <p className="text-[10px] text-primary font-medium mt-0.5">
                {selectedByslot[s].length} day{selectedByslot[s].length === 1 ? "" : "s"}
              </p>
            </button>
          ))}
        </div>

        <SurfaceCard>
          <PlacementCalendarPicker
            month={month}
            slot={activeSlot}
            selection={selectedByslot[activeSlot]}
            onToggleDate={(d) => toggleDate(activeSlot, d)}
            onMonthChange={setMonth}
            excludeOfferId={existingId}
          />
        </SurfaceCard>

        <SurfaceCard className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
            <p className="font-display text-2xl">{money(total)}</p>
            <p className="text-[11px] text-muted-foreground">{totalDays} placement day{totalDays === 1 ? "" : "s"}</p>
          </div>
        </SurfaceCard>

        {!brandSubActive && (
          <div className="rounded-[12px] border border-primary/30 bg-primary/5 p-3 text-[12px] font-body text-foreground/80 leading-snug">
            Submitting requires an active <span className="font-semibold">STRAND Brand Access</span> membership (£99/year). Save as draft any time.
          </div>
        )}

        <div className="sticky bottom-0 -mx-5 bg-background/95 backdrop-blur border-t border-border px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2">
          <Button variant="outline" size="pill" onClick={() => submit(true)} disabled={submitting} className="flex-1">
            Save draft
          </Button>
          <Button variant="gold" size="pill" onClick={() => submit(false)} disabled={submitting} className="flex-1">
            {brandSubActive ? "Submit for review" : "Unlock & submit"}
          </Button>
        </div>
      </div>

      <ImageCropDialog
        file={cropFile}
        mode={cropTarget?.kind === "product" ? "product" : "banner"}
        onCancel={() => { setCropFile(null); setCropTarget(null); }}
        onCropped={onCropped}
      />
    </ScreenLayout>
  );
};

/** Sign the hero image path for preview. */
function useHeroPreview(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useMemo(() => {
    if (!path) { setUrl(null); return; }
    supabase.storage.from("brand-assets").createSignedUrl(path, 60 * 60).then(({ data }) => {
      setUrl(data?.signedUrl ?? null);
    });
  }, [path]);
  return url;
}

export default BrandCreateOffer;
