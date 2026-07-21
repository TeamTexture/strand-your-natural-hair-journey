import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles, Image as ImageIcon, Trash2, Loader2, Plus, Search, PackagePlus, Wrench } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PlacementCalendarPicker from "@/components/PlacementCalendarPicker";
import BannerPreview from "@/components/brand/BannerPreview";
import ImageCropDialog from "@/components/brand/ImageCropDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PlacementSlot, SLOT_LABEL, usePlacementRates, useBrandOffer, usePendingRevision, useSubmitBrandOfferRevision, RevisionProductSnapshot } from "@/hooks/useBrandOffers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBrandSubscription } from "@/hooks/useBrandSubscription";
import { AlertTriangle } from "lucide-react";

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

interface CatalogueItem {
  kind: AttachKind;
  source_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  ingredients: string[] | null;
  tool_kind: string | null;
  key_features: string[] | null;
  materials: string[] | null;
  source_url: string | null;
  user_count: number;
}

type CatalogueFilter = "all" | AttachKind;

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

const toToolKind = (category: string | null) => {
  const value = (category ?? "").toLowerCase();
  if (value.includes("brush")) return "brush";
  if (value.includes("comb")) return "comb";
  if (value.includes("bonnet") || value.includes("scarf")) return "bonnet";
  if (value.includes("heat hat") || value.includes("heat cap")) return "heat_cap";
  if (value.includes("dryer")) return "hair_dryer";
  if (value.includes("diffuser")) return "diffuser";
  if (value.includes("iron")) return "flat_iron";
  if (value.includes("wand") || value.includes("curler")) return "curling_wand";
  if (value.includes("pillow")) return "pillowcase";
  if (value.includes("towel")) return "microfibre_towel";
  if (value.includes("clip")) return "sectioning_clips";
  if (value.includes("scissor")) return "scissors";
  return category ? "other" : null;
};

const BrandCreateOffer = () => {
  const { id: existingId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rates } = usePlacementRates();
  const { data: existing } = useBrandOffer(existingId);
  const { data: pendingRevision } = usePendingRevision(existingId);
  const submitRevision = useSubmitBrandOfferRevision();

  // Revision mode = editing an already-live or paid-scheduled offer. Only creative
  // fields (title, body, code, URL, banner, attached products/tools) can change;
  // placements/dates are locked, no Stripe interaction, admin re-approves before
  // consumers see the new creative.
  const isRevisionMode = existing?.status === "paid_scheduled" || existing?.status === "live";

  const [headline, setHeadline] = useState(existing?.headline ?? "");
  const [bodyCopy, setBodyCopy] = useState(existing?.body_copy ?? "");
  const [discountCode, setDiscountCode] = useState(existing?.discount_code ?? "");
  const [externalUrl, setExternalUrl] = useState(existing?.external_url ?? "");
  const [heroPath, setHeroPath] = useState<string | null>(existing?.hero_image_path ?? null);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [products, setProducts] = useState<ProductDraft[]>(
    (existing?.brand_products ?? []).map((p) => {
      const row = p as typeof p & {
        kind?: string;
        tool_kind?: string | null;
        key_features?: string[] | null;
        materials?: string[] | null;
      };
      const kind: AttachKind = row.kind === "tool" ? "tool" : "product";
      return {
        id: p.id,
        kind,
        name: p.name,
        description: p.description ?? "",
        external_url: p.external_url ?? "",
        image_urls: p.image_urls ?? [],
        ingredients: p.ingredients ?? [],
        tool_kind: row.tool_kind ?? null,
        key_features: row.key_features ?? [],
        materials: row.materials ?? [],
        source_type: (p.source_type as ProductDraft["source_type"]) ?? "manual",
        source_url: p.source_url,
        linked_product_id: p.linked_product_id,
      } satisfies ProductDraft;
    }),
  );
  const initialEnabled = (): Record<PlacementSlot, boolean> => {
    const map: Record<PlacementSlot, boolean> = { home: false, products: false, wash_day: false };
    (existing?.brand_offer_placements ?? []).forEach((p) => {
      map[p.slot as PlacementSlot] = true;
    });
    return map;
  };
  const initialDates = (): string[] => {
    const set = new Set<string>();
    (existing?.brand_offer_placements ?? []).forEach((p) => set.add(p.placement_date));
    return Array.from(set).sort();
  };
  const [enabledSlots, setEnabledSlots] = useState<Record<PlacementSlot, boolean>>(initialEnabled);
  const [selectedDates, setSelectedDates] = useState<string[]>(initialDates);

  const [month, setMonth] = useState(() => new Date());
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewMode, setPreviewMode] = useState<"collapsed" | "expanded">("collapsed");
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [catalogueKind, setCatalogueKind] = useState<CatalogueFilter>("all");
  const [catalogueSearch, setCatalogueSearch] = useState("");

  // Cropper state — one dialog reused for banner or a specific product image.
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropTarget, setCropTarget] = useState<{ kind: "banner" } | { kind: "product"; index: number } | null>(null);

  const heroPreview = useHeroPreview(heroPath);

  useEffect(() => {
    if (!existingId || !existing) return;
    // In revision mode with a pending revision, edits should start from the LATEST
    // pending values (so brands can "update changes"). Otherwise, start from the
    // live/persisted offer creative.
    const source = isRevisionMode && pendingRevision ? {
      headline: pendingRevision.headline,
      body_copy: pendingRevision.body_copy,
      discount_code: pendingRevision.discount_code,
      external_url: pendingRevision.external_url,
      hero_image_path: pendingRevision.hero_image_path ?? existing.hero_image_path,
    } : {
      headline: existing.headline,
      body_copy: existing.body_copy,
      discount_code: existing.discount_code,
      external_url: existing.external_url,
      hero_image_path: existing.hero_image_path,
    };
    setHeadline(source.headline ?? "");
    setBodyCopy(source.body_copy ?? "");
    setDiscountCode(source.discount_code ?? "");
    setExternalUrl(source.external_url ?? "");
    setHeroPath(source.hero_image_path ?? null);

    const productSource: ProductDraft[] = isRevisionMode && pendingRevision
      ? (pendingRevision.products ?? []).map((p) => ({
          kind: p.kind ?? "product",
          name: p.name ?? "",
          description: p.description ?? "",
          external_url: p.external_url ?? "",
          image_urls: p.image_urls ?? [],
          ingredients: p.ingredients ?? [],
          tool_kind: p.tool_kind ?? null,
          key_features: p.key_features ?? [],
          materials: p.materials ?? [],
          source_type: p.source_type ?? "manual",
          source_url: p.source_url ?? null,
          linked_product_id: p.linked_product_id ?? null,
        }))
      : (existing.brand_products ?? []).map((p) => {
          const row = p as typeof p & {
            kind?: string; tool_kind?: string | null;
            key_features?: string[] | null; materials?: string[] | null;
          };
          const kind: AttachKind = row.kind === "tool" ? "tool" : "product";
          return {
            id: p.id,
            kind,
            name: p.name,
            description: p.description ?? "",
            external_url: p.external_url ?? "",
            image_urls: p.image_urls ?? [],
            ingredients: p.ingredients ?? [],
            tool_kind: row.tool_kind ?? null,
            key_features: row.key_features ?? [],
            materials: row.materials ?? [],
            source_type: (p.source_type as ProductDraft["source_type"]) ?? "manual",
            source_url: p.source_url,
            linked_product_id: p.linked_product_id,
          } satisfies ProductDraft;
        });
    setProducts(productSource);

    // Placements are locked in revision mode — still hydrate them so the calendar
    // shows the booked dates if the brand looks. But the UI hides the picker.
    const enabled: Record<PlacementSlot, boolean> = { home: false, products: false, wash_day: false };
    const set = new Set<string>();
    (existing.brand_offer_placements ?? []).forEach((p) => {
      enabled[p.slot as PlacementSlot] = true;
      set.add(p.placement_date);
    });
    setEnabledSlots(enabled);
    setSelectedDates(Array.from(set).sort());
  }, [existingId, existing, isRevisionMode, pendingRevision]);

  const catalogueQuery = useQuery({
    queryKey: ["brand-catalogue-items", catalogueKind, catalogueSearch],
    enabled: catalogueOpen,
    queryFn: async (): Promise<CatalogueItem[]> => {
      const { data, error } = await supabase.functions.invoke("brand-catalogue", {
        body: {
          _kind: catalogueKind,
          _search: catalogueSearch.trim() || null,
          _limit: 80,
        },
      });
      if (error) throw new Error(error.message ?? "Catalogue unavailable");
      return Array.isArray(data?.items) ? data.items : [];
    },
  });

  const enabledSlotList = useMemo(
    () => SLOTS.filter((s) => enabledSlots[s]),
    [enabledSlots],
  );

  const total = useMemo(() => {
    if (!rates) return 0;
    return enabledSlotList.reduce((sum, s) => sum + selectedDates.length * rates[s], 0);
  }, [enabledSlotList, selectedDates, rates]);

  const totalDays = selectedDates.length;

  const toggleSlot = (slot: PlacementSlot) => {
    setEnabledSlots((prev) => ({ ...prev, [slot]: !prev[slot] }));
  };

  const toggleDate = (date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date].sort(),
    );
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

  const [scrapeKind, setScrapeKind] = useState<AttachKind>("product");

  const runScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke("brand-product-scrape", {
        body: { url: scrapeUrl.trim(), kind: scrapeKind },
      });
      if (error) throw error;
      const item = data?.item ?? data?.product ?? data?.tool;
      if (!item) throw new Error("No draft data returned");
      const kind: AttachKind = data?.kind === "tool" || item.kind === "tool" ? "tool" : "product";
      setProducts((prev) => [
        ...prev,
        {
          kind,
          name: item.name ?? "",
          description: item.description ?? "",
          external_url: item.external_url ?? scrapeUrl,
          image_urls: item.image_urls ?? [],
          ingredients: kind === "product" && Array.isArray(item.ingredients) ? item.ingredients : [],
          tool_kind: kind === "tool" ? (item.tool_kind ?? null) : null,
          key_features: kind === "tool" && Array.isArray(item.key_features) ? item.key_features : [],
          materials: kind === "tool" && Array.isArray(item.materials) ? item.materials : [],
          source_type: "ai",
          source_url: scrapeUrl,
        },
      ]);
      setScrapeUrl("");
      toast.success(kind === "tool" ? "Tool draft added — review and edit below" : "Product draft added — review and edit below");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scrape failed");
    } finally {
      setScraping(false);
    }
  };

  const isCatalogueItemAttached = (item: CatalogueItem) =>
    products.some((p) => p.linked_product_id === item.source_id && p.kind === item.kind);

  const attachCatalogueItem = (item: CatalogueItem) => {
    if (isCatalogueItemAttached(item)) {
      setProducts((prev) => prev.filter((p) => !(p.linked_product_id === item.source_id && p.kind === item.kind)));
      toast.success(`${item.kind === "tool" ? "Tool" : "Product"} removed`);
      return;
    }
    const label = item.kind === "tool" ? "tool" : "product";
    setProducts((prev) => [
      ...prev,
      {
        kind: item.kind,
        name: item.name,
        description: item.brand ? `${item.brand}${item.category ? ` · ${item.category}` : ""}` : (item.category ?? ""),
        external_url: item.source_url ?? "",
        image_urls: item.image_url ? [item.image_url] : [],
        ingredients: item.kind === "product" ? (item.ingredients ?? []) : [],
        tool_kind: item.kind === "tool" ? (toToolKind(item.tool_kind ?? item.category) ?? item.tool_kind) : null,
        key_features: item.kind === "tool" ? (item.key_features ?? []) : [],
        materials: item.kind === "tool" ? (item.materials ?? []) : [],
        source_type: "linked",
        source_url: item.source_url,
        linked_product_id: item.source_id,
      },
    ]);
    toast.success(`${label === "tool" ? "Tool" : "Product"} attached`);
  };

  const { isActive: brandSubActive } = useBrandSubscription();

  const firstProduct = products[0];
  const firstProductImage = firstProduct?.image_urls?.[0] ?? null;

  const submit = async (asDraft: boolean) => {
    if (!user) return;
    // Headline is optional — no validation required.
    if (!asDraft && !heroPath) return toast.error("Upload a banner image (1500×320) before submitting.");
    if (!asDraft && (enabledSlotList.length === 0 || totalDays === 0)) return toast.error("Select at least one slot and one date.");
    if (!asDraft && !brandSubActive) {
      toast("Annual brand membership required to submit for review.");
      nav(`/brand/subscribe?next=${encodeURIComponent(`/brand/offers/${existingId ?? "new"}`)}`);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        brand_user_id: user.id,
        headline: headline.trim() || null,
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
      const allDates = [...selectedDates].sort();
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

      const placementRows = enabledSlotList.flatMap((s) =>
        selectedDates.map((d) => ({
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
        const productRows = products
          .filter((p) => asDraft || p.name.trim() || p.description.trim() || p.external_url.trim() || p.image_urls.length > 0)
          .map((p, i) => ({
          offer_id: offerId!,
          name: p.name || (p.kind === "tool" ? "Untitled tool" : "Untitled product"),
          description: p.description || null,
          external_url: p.external_url || null,
          image_urls: p.image_urls,
          ingredients: p.kind === "product" ? p.ingredients : [],
          kind: p.kind,
          tool_kind: p.kind === "tool" ? p.tool_kind : null,
          key_features: p.kind === "tool" ? p.key_features : [],
          materials: p.kind === "tool" ? p.materials : [],
          source_type: p.source_type,
          source_url: p.source_url ?? null,
          linked_product_id: p.linked_product_id ?? null,
          position: i,
        }));
        // Cast: brand_products was just extended with kind/tool_kind/key_features/materials;
        // generated types will catch up on the next codegen.
        if (productRows.length > 0) {
          const { error } = await supabase
            .from("brand_products")
            .insert(productRows as unknown as never);
          if (error) throw error;
        }
      }

      qc.invalidateQueries({ queryKey: ["brand-offers"] });
      qc.invalidateQueries({ queryKey: ["brand-offer", offerId] });
      toast.success(asDraft ? "Saved as draft" : "Submitted for review");
      nav("/brand");
    } catch (e) {
      console.error("Brand offer save failed", e);
      const msg =
        (e as { message?: string; error_description?: string; hint?: string })?.message ||
        (e as { error_description?: string })?.error_description ||
        "Save failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (existingId && !existing) return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar title={existingId ? "Edit offer" : "Create offer"} onBack={() => nav("/brand")} />
      <div className="px-5 pb-0 space-y-5 overflow-x-hidden">
        <SectionLabel className="!px-0 !mt-0">Creative</SectionLabel>
        <SurfaceCard className="space-y-3">
          <div>
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Headline</Label>
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. 10% off your first filter" maxLength={80} />
            <p className="text-[11px] text-muted-foreground font-body mt-1 leading-snug">
              Title is optional. If your graphic already contains text, adding a title here will obstruct it — choose one or the other.
            </p>
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
              1500×320px (4.7:1). Keep the focal point in the RIGHT third — your app-rendered headline
              overlays the left. <span className="font-medium">Text on the image is allowed</span> —
              keep it <span className="font-medium">bold, large and minimal</span> (2–4 words max) so it stays legible
              at the 80px collapsed strip. Avoid small print, paragraphs or logos with fine detail.
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
        <div className="flex flex-wrap gap-1.5 text-[11px]">
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
        <div className="w-full min-w-0 overflow-hidden rounded-[12px] bg-muted/40 p-2">
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

        <SectionLabel className="!px-0">Attach products &amp; tools</SectionLabel>
        <SurfaceCard className="space-y-3">
          <div className="rounded-[12px] border border-primary/25 bg-primary/5 p-3">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5">
              <PackagePlus className="size-3 text-primary" /> Browse app catalogue
            </Label>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Search anonymised products and tools already used in STRAND, then attach the item to this advert.
            </p>
            <Button type="button" variant="outline" size="pill" onClick={() => setCatalogueOpen(true)} className="mt-2 w-full px-4">
              Browse products &amp; tools
            </Button>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3 text-primary" /> AI page from a link
            </Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Paste any product or tool URL — we'll draft a STRAND page you can edit. Choose the item type first so the right fields are drafted (ingredients for products, key features for tools).
            </p>
            <div className="flex gap-1.5 mt-1.5">
              {(["product", "tool"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setScrapeKind(k)}
                  className={`px-3 py-1 rounded-pill border text-[11px] capitalize ${
                    scrapeKind === k
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-1.5 min-w-0">
              <Input className="min-w-0" value={scrapeUrl} onChange={(e) => setScrapeUrl(e.target.value)} placeholder="https://" />
              <Button type="button" variant="outline" size="pill" onClick={runScrape} disabled={scraping || !scrapeUrl.trim()} className="w-auto shrink-0 px-4">
                {scraping ? <Loader2 className="size-4 animate-spin" /> : "Draft"}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={() => setProducts((p) => [...p, emptyProduct("product")])}
              className="text-[12px] text-primary underline underline-offset-2"
            >
              + Add product manually
            </button>
            <button
              type="button"
              onClick={() => setProducts((p) => [...p, emptyProduct("tool")])}
              className="text-[12px] text-primary underline underline-offset-2"
            >
              + Add tool manually
            </button>
          </div>
        </SurfaceCard>

        {products.map((p, i) => (
          <SurfaceCard key={i} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body">
                {p.kind === "tool" ? "Tool" : "Product"} {i + 1} · {p.source_type === "ai" ? "AI draft" : "Manual"}
              </p>
              <button
                type="button"
                onClick={() => setProducts((prev) => prev.filter((_, x) => x !== i))}
                className="text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            {/* Product / Tool toggle */}
            <div className="flex gap-1.5">
              {(["product", "tool"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() =>
                    setProducts((prev) => prev.map((x, xi) => (xi === i ? { ...x, kind: k } : x)))
                  }
                  className={`px-3 py-1 rounded-pill border text-[11px] capitalize ${
                    p.kind === k
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {p.kind === "tool" ? "Tool image" : "Product image"} (1:1, min 800×800)
              </Label>
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
              placeholder={p.kind === "tool" ? "Tool name" : "Product name"}
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

            {p.kind === "product" ? (
              <Textarea
                value={p.ingredients.join(", ")}
                onChange={(e) =>
                  setProducts((prev) =>
                    prev.map((x, xi) =>
                      xi === i
                        ? { ...x, ingredients: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }
                        : x,
                    ),
                  )
                }
                placeholder="Ingredients (comma-separated)"
                rows={2}
              />
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tool kind</Label>
                  <select
                    value={p.tool_kind ?? ""}
                    onChange={(e) =>
                      setProducts((prev) =>
                        prev.map((x, xi) => (xi === i ? { ...x, tool_kind: e.target.value || null } : x)),
                      )
                    }
                    className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-[13px] font-body"
                  >
                    <option value="">Select a type…</option>
                    {TOOL_KINDS.map((tk) => (
                      <option key={tk.value} value={tk.value}>{tk.label}</option>
                    ))}
                  </select>
                </div>
                <Textarea
                  value={p.key_features.join(", ")}
                  onChange={(e) =>
                    setProducts((prev) =>
                      prev.map((x, xi) =>
                        xi === i
                          ? { ...x, key_features: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }
                          : x,
                      ),
                    )
                  }
                  placeholder="Key features (comma-separated) — e.g. adjustable heat, ionic, silk-lined"
                  rows={2}
                />
                <Textarea
                  value={p.materials.join(", ")}
                  onChange={(e) =>
                    setProducts((prev) =>
                      prev.map((x, xi) =>
                        xi === i
                          ? { ...x, materials: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }
                          : x,
                      ),
                    )
                  }
                  placeholder="Materials (comma-separated) — e.g. satin, boar bristle, ceramic"
                  rows={2}
                />
              </div>
            )}
          </SurfaceCard>
        ))}

        <SectionLabel className="!px-0">Placements &amp; calendar</SectionLabel>
        <p className="text-[11px] font-body text-muted-foreground -mt-1 px-1 leading-snug">
          Pick one or more banner slots, then choose the dates in the calendar below.
          Your total updates automatically.
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {SLOTS.map((s) => {
            const on = enabledSlots[s];
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSlot(s)}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-primary/5"
                }`}
              >
                <p className="text-[10px] font-body font-medium leading-tight">{SLOT_LABEL[s]}</p>
                <p className={`text-[10px] ${on ? "text-primary-foreground/85" : "text-muted-foreground"}`}>
                  {rates ? money(rates[s]) : "…"}/day
                </p>
                <p className={`text-[10px] font-medium mt-0.5 ${on ? "text-primary-foreground" : "text-muted-foreground/70"}`}>
                  {on ? "Selected" : "Tap to add"}
                </p>
              </button>
            );
          })}
        </div>

        <SurfaceCard>
          <PlacementCalendarPicker
            month={month}
            slots={enabledSlotList}
            selection={selectedDates}
            onToggleDate={(d) => toggleDate(d)}
            onMonthChange={setMonth}
            excludeOfferId={existingId}
          />
          {enabledSlotList.length === 0 && (
            <p className="text-[11px] font-body text-muted-foreground mt-2 text-center">
              Select at least one banner slot above to book dates.
            </p>
          )}
        </SurfaceCard>

        <SurfaceCard className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
            <p className="font-display text-2xl">{money(total)}</p>
            <p className="text-[11px] text-muted-foreground">
              {totalDays} day{totalDays === 1 ? "" : "s"} × {enabledSlotList.length} slot{enabledSlotList.length === 1 ? "" : "s"}
            </p>
          </div>
        </SurfaceCard>

        {!brandSubActive && (
          <div className="rounded-[12px] border border-primary/30 bg-primary/5 p-3 text-[12px] font-body text-foreground/80 leading-snug">
            Submitting requires an active <span className="font-semibold">STRAND Brand Access</span> membership (£99/year). Save as draft any time.
          </div>
        )}

        <div className="sticky bottom-0 -mx-5 bg-background/95 backdrop-blur border-t border-border px-5 pt-2 pb-2 flex gap-2">
          <Button variant="outline" size="pill" onClick={() => submit(true)} disabled={submitting} className="flex-1 min-w-0 w-auto px-2 text-[11px] uppercase tracking-wide">
            SAVE DRAFT
          </Button>
          <Button variant="gold" size="pill" onClick={() => submit(false)} disabled={submitting} className="flex-1 min-w-0 w-auto px-2 text-[11px] uppercase tracking-wide">
            {brandSubActive ? "SUBMIT FOR REVIEW" : "UNLOCK"}
          </Button>
        </div>

      </div>

      <Dialog open={catalogueOpen} onOpenChange={setCatalogueOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[343px] max-h-[82vh] overflow-hidden rounded-[14px] p-0">
          <DialogHeader className="p-4 pb-2 text-left">
            <DialogTitle className="font-display text-lg">App catalogue</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4 space-y-3 overflow-hidden">
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {(["all", "product", "tool"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCatalogueKind(k)}
                  className={`px-3 py-1 rounded-pill border capitalize ${
                    catalogueKind === k ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {k === "all" ? "All" : `${k}s`}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={catalogueSearch}
                onChange={(e) => setCatalogueSearch(e.target.value)}
                placeholder="Search products or tools"
                className="pl-9"
              />
            </div>
            <div className="max-h-[54vh] overflow-y-auto pr-1 space-y-2">
              {catalogueQuery.isLoading ? (
                <div className="py-8"><LoadingDot /></div>
              ) : catalogueQuery.isError ? (
                <div className="rounded-[12px] border border-destructive/30 bg-destructive/5 px-3 py-4 text-center">
                  <p className="text-[12px] font-medium text-destructive">Catalogue could not load.</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {catalogueQuery.error instanceof Error ? catalogueQuery.error.message : "Please try again."}
                  </p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => catalogueQuery.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : catalogueQuery.data?.length ? (
                catalogueQuery.data.map((item) => {
                  const attached = isCatalogueItemAttached(item);
                  return (
                    <button
                      key={`${item.kind}-${item.source_id}`}
                      type="button"
                      onClick={() => attachCatalogueItem(item)}
                      aria-pressed={attached}
                      className={`w-full text-left rounded-[12px] border p-2.5 transition-colors ${
                        attached
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div className="flex gap-2.5 min-w-0">
                        <div className={`size-12 shrink-0 rounded-lg border overflow-hidden flex items-center justify-center text-primary ${attached ? "border-primary bg-primary/5" : "bg-muted border-border"}`}>
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="size-full object-cover" />
                          ) : item.kind === "tool" ? (
                            <Wrench className="size-5" />
                          ) : (
                            <PackagePlus className="size-5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className={`font-display text-[14px] leading-tight truncate ${attached ? "text-primary" : ""}`}>{item.name}</p>
                            <span className={`shrink-0 text-[8px] uppercase tracking-wider rounded-pill px-1.5 py-[1px] border ${attached ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                              {item.kind === "tool" ? "Tool" : "Product"}
                            </span>
                            {attached ? (
                              <span className="shrink-0 text-[8px] uppercase tracking-wider rounded-pill px-1.5 py-[1px] bg-primary text-primary-foreground">
                                Attached
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {[item.brand, item.category].filter(Boolean).join(" · ") || "STRAND catalogue item"}
                          </p>
                          <p className="text-[10px] text-primary font-body mt-0.5">
                            {item.user_count} member{item.user_count === 1 ? "" : "s"} have added this
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="text-[12px] text-muted-foreground text-center py-8">No catalogue matches yet.</p>
              )}
            </div>
          </div>
          <div className="border-t border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {products.filter((p) => p.source_type === "linked").length} attached
            </p>
            <Button type="button" size="sm" onClick={() => setCatalogueOpen(false)} className="rounded-pill px-5">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    supabase.storage.from("brand-assets").createSignedUrl(path, 60 * 60).then(({ data }) => {
      setUrl(data?.signedUrl ?? null);
    });
  }, [path]);
  return url;
}

export default BrandCreateOffer;
