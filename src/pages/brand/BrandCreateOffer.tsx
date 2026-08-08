import { smartBack } from "@/lib/smartBack";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useOwnerMode, ownerHomeRoute, ownerOfferRoute } from "@/hooks/useOwnerMode";
import { useProSubscription } from "@/hooks/useProSubscription";
import { Sparkles, Image as ImageIcon, Trash2, Loader2, Plus, Search, PackagePlus, Wrench } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import TargetingPicker from "@/components/brand/TargetingPicker";
import { useOfferTargeting, saveOfferTargeting } from "@/hooks/useAdTargeting";
import { cleanRules, rulesAreEmpty, type TargetingRules } from "@/lib/adTargeting";
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
import { scanProductLink, normaliseProductUrl } from "@/lib/brandLinkScan";
import { useAuth } from "@/hooks/useAuth";
import { PlacementSlot, SLOT_LABEL, useBrandOffer, usePendingRevision, useSubmitBrandOfferRevision, RevisionProductSnapshot } from "@/hooks/useBrandOffers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBrandSubscription } from "@/hooks/useBrandSubscription";
import { useBrandShelf } from "@/hooks/useBrandShelf";
import { AlertTriangle } from "lucide-react";
import TrialPriceTag from "@/components/brand/TrialPriceTag";
import {
  buildCostBreakdown,
  buildUpliftQuote,
  dailyRatePence,
  money,
  NO_REFUND_NOTE,
  TRIAL_PRICING_NOTE,

  type PricedSlot,
  type QuotePlacement,
} from "@/lib/adPricing";

import { SLOT_AUDIENCE } from "@/hooks/useBrandOffers";

const SLOTS: PlacementSlot[] = ["home", "products", "wash_day", "pro_welcome"];

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
  const ownerMode = useOwnerMode();
  const { data: existing } = useBrandOffer(existingId);
  const { data: pendingRevision } = usePendingRevision(existingId);
  const submitRevision = useSubmitBrandOfferRevision();
  const { isActive: proSubActive } = useProSubscription();

  // Revision mode = editing an already-live or paid-scheduled offer. Creative
  // fields AND the audience can change; placements/dates stay locked. Everything
  // goes through the same revision → admin review flow, and the live campaign
  // keeps its current creative and its current audience until approval.
  const isRevisionMode = existing?.status === "paid_scheduled" || existing?.status === "live";

  // Audience targeting (optional). Empty = broad campaign shown to everyone.
  const [targeting, setTargeting] = useState<TargetingRules>({});
  const [targetingLoaded, setTargetingLoaded] = useState(false);
  const { data: savedTargeting } = useOfferTargeting(existingId);
  const cleanTargeting = cleanRules(targeting);
  const targetingEmpty = rulesAreEmpty(cleanTargeting);
  // Reach is displayed as an approximate band inside TargetingPicker itself.

  // ── Live audience change (revision mode) ──────────────────────────────────
  const liveTargeting = cleanRules(savedTargeting ?? {});
  const liveTargetedBefore = !rulesAreEmpty(liveTargeting);
  const targetingDirty =
    isRevisionMode && JSON.stringify(liveTargeting) !== JSON.stringify(cleanTargeting);
  const londonTodayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const campaignEnded =
    !!existing?.ends_on && existing.ends_on < londonTodayStr;
  const upliftQuote = useMemo(
    () =>
      buildUpliftQuote(
        (existing?.brand_offer_placements ?? []) as QuotePlacement[],
        londonTodayStr,
        liveTargetedBefore,
        !targetingEmpty,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [existing?.brand_offer_placements, londonTodayStr, liveTargetedBefore, targetingEmpty],
  );


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
    const map: Record<PlacementSlot, boolean> = { home: false, products: false, wash_day: false, pro_welcome: false };
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
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [shelfOpen, setShelfOpen] = useState(false);

  // Cropper state — one dialog reused for banner or a specific product image.
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropTarget, setCropTarget] = useState<{ kind: "banner" } | { kind: "product"; index: number } | null>(null);
  const [isDraggingBanner, setIsDraggingBanner] = useState(false);

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
    const enabled: Record<PlacementSlot, boolean> = { home: false, products: false, wash_day: false, pro_welcome: false };
    const set = new Set<string>();
    (existing.brand_offer_placements ?? []).forEach((p) => {
      enabled[p.slot as PlacementSlot] = true;
      set.add(p.placement_date);
    });
    setEnabledSlots(enabled);
    setSelectedDates(Array.from(set).sort());
  }, [existingId, existing, isRevisionMode, pendingRevision]);

  const { data: shelfAll = [] } = useBrandShelf();
  const shelfItems = shelfAll.filter((i) => i.approval_status === "approved");

  const enabledSlotList = useMemo(
    () => SLOTS.filter((s) => enabledSlots[s]),
    [enabledSlots],
  );

  // Pricing reads from the single config (src/lib/adPricing.ts). A campaign with
  // any targeting rows is charged that slot's explicit targeted rate.

  const costs = useMemo(
    () => buildCostBreakdown(enabledSlotList as PricedSlot[], selectedDates.length, !targetingEmpty),
    [enabledSlotList, selectedDates.length, targetingEmpty],
  );
  const total = costs.totalPence;

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
    const normalised = normaliseProductUrl(scrapeUrl);
    if (!normalised) {
      if (scrapeUrl.trim()) toast.error("That doesn't look like a valid web link.");
      return;
    }
    setScraping(true);
    try {
      // Same edge function the member "paste a link" flow calls. One
      // implementation only — the old brand-product-scrape is deleted.
      const item = await scanProductLink(normalised);
      const kind: AttachKind = scrapeKind === "tool" ? "tool" : "product";
      setProducts((prev) => [
        ...prev,
        {
          kind,
          name: item.name ?? "",
          description: item.description ?? "",
          external_url: item.external_url ?? normalised,
          image_urls: item.image_urls ?? [],
          ingredients: kind === "product" ? item.ingredients : [],
          tool_kind: null,
          key_features: [],
          materials: [],
          source_type: "ai",
          source_url: normalised,
        },
      ]);
      setScrapeUrl("");
      toast.success(kind === "tool" ? "Tool draft added — review and edit below" : "Product draft added — review and edit below");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that page");
    } finally {
      setScraping(false);
    }
  };


  // Attaching from the brand's OWN shelf. The shelf item is copied into the
  // advert draft (adverts keep their own snapshot of a product) and tagged with
  // linked_product_id so the shelf item it came from stays traceable.
  const isShelfItemAttached = (id: string) =>
    products.some((p) => p.linked_product_id === id);

  const toggleShelfItem = (item: {
    id: string;
    name: string;
    description: string | null;
    kind: string;
    tool_kind: string | null;
    ingredients: string[] | null;
    key_features: string[] | null;
    materials: string[] | null;
    image_urls: string[] | null;
    external_url: string | null;
  }) => {
    if (isShelfItemAttached(item.id)) {
      setProducts((prev) => prev.filter((p) => p.linked_product_id !== item.id));
      toast.success("Removed from this advert");
      return;
    }
    const kind: AttachKind = item.kind === "tool" ? "tool" : "product";
    setProducts((prev) => [
      ...prev,
      {
        kind,
        name: item.name,
        description: item.description ?? "",
        external_url: item.external_url ?? "",
        image_urls: item.image_urls ?? [],
        ingredients: kind === "product" ? (item.ingredients ?? []) : [],
        tool_kind: kind === "tool" ? item.tool_kind : null,
        key_features: item.key_features ?? [],
        materials: item.materials ?? [],
        source_type: "linked",
        linked_product_id: item.id,
      },
    ]);
    toast.success("Attached from your shelf");
  };


  const { isActive: brandSubActive } = useBrandSubscription();

  useEffect(() => {
    if (savedTargeting && !targetingLoaded) {
      setTargeting(savedTargeting);
      setTargetingLoaded(true);
    }
  }, [savedTargeting, targetingLoaded]);

  const firstProduct = products[0];
  const firstProductImage = firstProduct?.image_urls?.[0] ?? null;

  const submit = async (asDraft: boolean) => {
    if (!user) return;

    // ── Revision path ──────────────────────────────────────────────────────────
    // Editing an already-paid/live offer: submit a pending revision for admin
    // review. No placement changes. The original creative AND the original
    // audience keep running until an admin approves.
    if (isRevisionMode && existingId) {
      if (!headline.trim()) return toast.error("A headline is required.");
      if (!heroPath) return toast.error("A banner image is required.");
      if (targetingDirty && campaignEnded) {
        return toast.error("This campaign has ended — its audience can no longer be changed.");
      }
      setSubmitting(true);
      try {
        const productSnapshots: RevisionProductSnapshot[] = products.map((p, i) => ({
          kind: p.kind,
          name: p.name || (p.kind === "tool" ? "Untitled tool" : "Untitled product"),
          description: p.description || null,
          external_url: p.external_url || null,
          image_urls: p.image_urls,
          ingredients: p.kind === "product" ? p.ingredients : [],
          tool_kind: p.kind === "tool" ? p.tool_kind : null,
          key_features: p.kind === "tool" ? p.key_features : [],
          materials: p.kind === "tool" ? p.materials : [],
          source_type: p.source_type,
          source_url: p.source_url ?? null,
          linked_product_id: p.linked_product_id ?? null,
          position: i,
        }));
        await submitRevision.mutateAsync({
          offer_id: existingId,
          headline: headline.trim() || null,
          body_copy: bodyCopy.trim() || null,
          discount_code: discountCode.trim() || null,
          external_url: externalUrl.trim() || null,
          hero_image_path: heroPath,
          products: productSnapshots,
          // Only sent when the audience actually changed, so a creative-only
          // edit never touches the live campaign's targeting.
          targeting: targetingDirty ? cleanTargeting : undefined,
        });

        // Nothing is charged here. Admin reviews first; a positive uplift is
        // only payable once the change has been approved.
        toast.success(
          targetingDirty
            ? "Creative and audience changes submitted for review"
            : "Changes submitted for review",
        );
        nav(`/brand/offers/${existingId}`);


      } catch (e) {
        const msg = e instanceof Error ? e.message : "Submit failed";
        toast.error(msg);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // A banner with no headline renders as an untitled campaign everywhere it
    // appears, so it is required to submit (drafts may still be half-finished).
    if (!asDraft && !headline.trim()) return toast.error("Add a headline before submitting.");
    if (!asDraft && !heroPath) return toast.error("Upload a banner image (1500×320) before submitting.");

    if (!asDraft && (enabledSlotList.length === 0 || totalDays === 0)) return toast.error("Select at least one slot and one date.");
    // Targeted campaigns may be submitted at any audience size — reporting is
    // banded for privacy, never suppressed, and delivery is unaffected.
    if (!asDraft && ownerMode === "brand" && !brandSubActive) {
      toast("Annual brand membership required to submit for review.");
      nav(`/brand/subscribe?next=${encodeURIComponent(`/brand/offers/${existingId ?? "new"}`)}`);
      return;
    }
    if (!asDraft && ownerMode === "pro" && !proSubActive) {
      toast("An active STRAND Pro subscription is required to promote.");
      nav(`/pro/billing`);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        brand_user_id: user.id,
        owner_type: ownerMode,
        headline: headline.trim() || null,
        body_copy: bodyCopy.trim() || null,
        discount_code: discountCode.trim() || null,
        external_url: externalUrl.trim() || null,
        hero_image_path: heroPath,
        // Saved as a draft first so the targeting rows exist before the status
        // flip — the database guard re-checks the audience floor on that flip.
        status: "draft" as "draft" | "under_review",
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
        const { error } = await supabase.from("brand_offers").update(payload as unknown as never).eq("id", offerId);
        if (error) throw error;
        await supabase.from("brand_offer_placements").delete().eq("offer_id", offerId);
        await supabase.from("brand_products").delete().eq("offer_id", offerId);
      } else {
        const { data, error } = await supabase.from("brand_offers").insert(payload as unknown as never).select("id").single();
        if (error) throw error;
        offerId = data.id;
      }

      const placementRows = enabledSlotList.flatMap((s) =>
        selectedDates.map((d) => ({
          offer_id: offerId!,
          slot: s,
          placement_date: d,
          // Snapshot the rate onto the placement row: displayed and charged
          // costs read this stored value, never live config, so a later rate
          // change (e.g. trial pricing ending) never re-prices this booking.
          daily_rate_pence: dailyRatePence(s as PricedSlot, !targetingEmpty),
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

      await saveOfferTargeting(offerId!, targeting);

      if (!asDraft) {
        // Server-side floor enforcement happens on this status change.
        const { error } = await supabase
          .from("brand_offers")
          .update({ status: "under_review" } as unknown as never)
          .eq("id", offerId!);
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ["brand-offers"] });
      qc.invalidateQueries({ queryKey: ["brand-offer", offerId] });
      qc.invalidateQueries({ queryKey: ["offer-targeting", offerId] });
      toast.success(asDraft ? "Saved as draft" : "Submitted for review");
      nav(ownerHomeRoute(ownerMode));
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
      <TitleBar title={existingId ? "Edit offer" : "Create offer"} onBack={smartBack(nav, "/brand")} />
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
            <label
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isDraggingBanner) setIsDraggingBanner(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingBanner(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingBanner(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingBanner(false);
                const f = Array.from(e.dataTransfer.files).find((file) =>
                  ["image/jpeg", "image/png", "image/webp"].includes(file.type)
                );
                if (f) onBannerFilePicked(f);
                else if (e.dataTransfer.files.length > 0) toast.error("Please drop a JPG, PNG or WebP image.");
              }}
              className={`flex items-center gap-2 mt-2 p-3 rounded-lg border border-dashed cursor-pointer transition-colors ${
                isDraggingBanner ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
            >
              <ImageIcon className="size-4 text-muted-foreground" />
              <span className="text-[12px] font-body text-muted-foreground flex-1">
                {uploadingHero
                  ? "Uploading…"
                  : isDraggingBanner
                  ? "Drop image to upload"
                  : heroPath
                  ? "Replace banner image — click or drag & drop"
                  : "Upload banner image — click or drag & drop (JPG/PNG/WebP up to 2MB)"}
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
        <div className="flex flex-wrap gap-1.5 text-[11px] items-center">
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
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground font-body cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSafeArea}
              onChange={(e) => setShowSafeArea(e.target.checked)}
              className="accent-emerald-500"
            />
            Show safe area
          </label>
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
            showSafeArea={showSafeArea}
          />
        </div>
        {showSafeArea && (
          <p className="text-[11px] text-muted-foreground font-body leading-snug px-1 -mt-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-400 align-middle mr-1" />
            Keep headlines, logos & key product imagery inside the dashed safe zone.
            <span className="inline-block w-2 h-2 rounded-sm bg-red-500/70 align-middle mx-1" />
            The outer 4–10% is bleed — on some phones it may be cropped, so avoid placing text right against the edge.
          </p>
        )}


        <SectionLabel className="!px-0">Attach products &amp; tools</SectionLabel>
        <SurfaceCard className="space-y-3">
          <div className="rounded-[12px] border border-primary/25 bg-primary/5 p-3">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5">
              <PackagePlus className="size-3 text-primary" /> Attach from your shelf
            </Label>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Your approved shelf products and tools. Attaching one here also lets members copy the
              advert's discount code straight from your brand page.
            </p>
            <Button type="button" variant="outline" size="pill" onClick={() => setShelfOpen(true)} className="mt-2 w-full px-4">
              Choose from your shelf
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

        {isRevisionMode ? (
          <>
            <div className="rounded-[12px] border border-warn/40 bg-warn/5 p-3 text-[12px] font-body text-foreground/85 leading-snug flex gap-2">
              <AlertTriangle className="size-4 text-warn shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">You're editing a live campaign</p>
                <p className="mt-1">
                  You can update creative content — banner, headline, body copy, discount code, link and attached products/tools — and your
                  audience. The date window, placements and stats stay exactly as booked. Changes go to admin for approval; your campaign keeps
                  running exactly as it is now until then.
                </p>
              </div>
            </div>

            <SectionLabel className="!px-0">Audience</SectionLabel>
            {campaignEnded ? (
              <p className="text-[12px] font-body text-muted-foreground px-1 leading-snug">
                This campaign has ended, so its audience can no longer be changed.
              </p>
            ) : (
              <>
                <TargetingPicker value={targeting} onChange={setTargeting} />

                {targetingDirty && (
                  <SurfaceCard className="space-y-2 border-primary/30">
                    <p className="font-display text-[14px] text-foreground">Audience change</p>

                    {upliftQuote.paymentRequired ? (
                      <div className="space-y-2 text-[12px] font-body text-foreground/85 leading-snug">
                        <p>
                          You booked this campaign at the broad rate. Adding an audience moves it to the targeted rate for the{" "}
                          <strong>
                            {upliftQuote.remainingDays} day{upliftQuote.remainingDays === 1 ? "" : "s"}
                          </strong>{" "}
                          still to run — days already delivered stay at the rate you paid.
                        </p>
                        <div className="space-y-1">
                          {upliftQuote.lines.map((line) => (
                            <div key={line.slot} className="flex items-baseline justify-between gap-2">
                              <span className="text-muted-foreground">
                                {SLOT_LABEL[line.slot] ?? line.slot} · {line.days} day{line.days === 1 ? "" : "s"} ·{" "}
                                {money(line.oldRatePence)} → {money(line.newRatePence)}
                              </span>
                              <span className="tabular-nums">{money(line.differencePence)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-baseline justify-between gap-2 border-t border-border/60 pt-2 font-medium">
                          <span>Total to pay now</span>
                          <span className="tabular-nums">{money(upliftQuote.totalPence)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Submitting takes you straight to secure checkout for {money(upliftQuote.totalPence)}. Your edits are saved either
                          way — if you don't finish paying you can come back and pay or discard them. The new audience goes to admin review
                          once payment clears.
                        </p>

                      </div>
                    ) : upliftQuote.isRemoval ? (
                      <p className="text-[12px] font-body text-foreground/85 leading-snug">{NO_REFUND_NOTE}</p>
                    ) : (
                      <p className="text-[12px] font-body text-foreground/85 leading-snug">
                        You're changing which members this reaches, but staying on the same rate — nothing more to pay.
                      </p>
                    )}
                  </SurfaceCard>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <SectionLabel className="!px-0">Audience</SectionLabel>
            <TargetingPicker value={targeting} onChange={setTargeting} />


            <SectionLabel className="!px-0">Placements &amp; calendar</SectionLabel>
            <p className="text-[11px] font-body text-muted-foreground -mt-1 px-1 leading-snug">
              Pick one or more banner slots, then choose the dates in the calendar below.
              Your total updates automatically.
            </p>
            {(["consumer", "pro"] as const).map((audience) => {
              const slotsForAudience = SLOTS.filter((s) => SLOT_AUDIENCE[s] === audience);
              if (slotsForAudience.length === 0) return null;
              return (
                <div key={audience} className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-body font-semibold px-1">
                    {audience === "consumer" ? "For consumers" : "For professionals"}
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {slotsForAudience.map((s) => {
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
                            {money(dailyRatePence(s as PricedSlot, !targetingEmpty))}/day
                          </p>
                          <p className={`text-[10px] font-medium mt-0.5 ${on ? "text-primary-foreground" : "text-muted-foreground/70"}`}>
                            {on ? "Selected" : "Tap to add"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

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

            <SurfaceCard className="space-y-2">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Cost</p>
                <TrialPriceTag />
              </div>
              {costs.lines.length === 0 || totalDays === 0 ? (
                <p className="text-[11px] font-body text-muted-foreground">
                  Pick slots and dates to see your cost.
                </p>
              ) : (
                <div className="space-y-1">
                  {costs.lines.map((l) => (
                    <div key={l.slot} className="flex items-baseline justify-between gap-2 text-[12px] font-body">
                      <span className="min-w-0 flex-1 text-foreground/85">
                        {SLOT_LABEL[l.slot as PlacementSlot]} · {l.days} day{l.days === 1 ? "" : "s"} × {money(l.ratePence)}/day
                      </span>
                      <span className="shrink-0">{money(l.subtotalPence)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2 border-t border-border pt-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                <p className="font-display text-2xl">{money(total)}</p>
              </div>
              <p className="text-[11px] font-body text-muted-foreground leading-snug">
                {targetingEmpty
                  ? "Broad campaign — standard slot rate, shown to all members in the slots you book."
                  : "Targeted campaign — the targeted rate for each slot you have booked applies, because you have narrowed the audience below. Clear your audience selection to return to the standard rate."}

              </p>
              <p className="text-[10.5px] font-body text-muted-foreground leading-snug">
                {TRIAL_PRICING_NOTE} Your rate is fixed at booking and never changes afterwards.
              </p>
            </SurfaceCard>

            {!brandSubActive && (
              <div className="rounded-[12px] border border-primary/30 bg-primary/5 p-3 text-[12px] font-body text-foreground/80 leading-snug">
                Submitting requires an active <span className="font-semibold">STRAND Brand Access</span> membership (£99/year). Save as draft any time.
              </div>
            )}
          </>
        )}

        <div className="sticky bottom-0 -mx-5 bg-background/95 backdrop-blur border-t border-border px-5 pt-2 pb-2 flex gap-2">
          {isRevisionMode ? (
            <Button variant="gold" size="pill" onClick={() => submit(false)} disabled={submitting} className="flex-1 text-[11px] uppercase tracking-wide">
              SUBMIT CHANGES FOR REVIEW
            </Button>
          ) : (
            <>
              <Button variant="outline" size="pill" onClick={() => submit(true)} disabled={submitting} className="flex-1 min-w-0 w-auto px-2 text-[11px] uppercase tracking-wide">
                SAVE DRAFT
              </Button>
              <Button variant="gold" size="pill" onClick={() => submit(false)} disabled={submitting} className="flex-1 min-w-0 w-auto px-2 text-[11px] uppercase tracking-wide">
                {brandSubActive ? "SUBMIT FOR REVIEW" : "UNLOCK"}
              </Button>
            </>
          )}
        </div>

      </div>

      <Dialog open={shelfOpen} onOpenChange={setShelfOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[343px] max-h-[82vh] overflow-hidden rounded-[14px] p-0">
          <DialogHeader className="p-4 pb-2 text-left">
            <DialogTitle className="font-display text-lg">Your shelf</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4 space-y-2 max-h-[62vh] overflow-y-auto">
            {shelfItems.length === 0 ? (
              <p className="text-[12px] text-muted-foreground text-center py-8 font-body">
                No approved shelf products yet.
              </p>
            ) : (
              shelfItems.map((item) => {
                const attached = isShelfItemAttached(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleShelfItem(item)}
                    className={`w-full text-left rounded-[12px] border p-3 flex items-center gap-2 ${
                      attached ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    {item.image_urls?.[0] ? (
                      <img
                        src={item.image_urls[0]}
                        alt={item.name}
                        loading="lazy"
                        className="size-11 rounded-[9px] object-cover bg-muted shrink-0"
                      />
                    ) : (
                      <span className="size-11 rounded-[9px] bg-muted shrink-0" aria-hidden />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block font-body text-[13px] leading-snug [overflow-wrap:anywhere] line-clamp-2">
                        {item.name}
                      </span>
                      <span className="block text-[11px] text-muted-foreground font-body capitalize">
                        {item.kind === "tool" ? "Tool" : "Product"}
                      </span>
                    </span>

                    <span className="text-[11px] font-body text-primary shrink-0">
                      {attached ? "Attached" : "Attach"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="px-4 pb-4">
            <Button type="button" size="sm" onClick={() => setShelfOpen(false)} className="rounded-pill px-5 w-full">
              Done
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
