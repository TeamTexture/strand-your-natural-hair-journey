// Brand shelf — the brand's permanent product catalogue.
//
// Adding a product reuses the member-side intelligence end to end: the same
// `product-analyse` dual-photo function for label scans and the same
// `product-analyse-url` function for product links. Nothing about how STRAND
// reads an ingredient list differs because a brand typed it in.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Camera, Link2, PencilLine, Eye, EyeOff, Trash2, ArrowUp, ArrowDown, ExternalLink, Loader2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import DualPhotoCaptureSheet from "@/components/DualPhotoCaptureSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { prepareImageForAi } from "@/lib/imagePrep";
import { toast } from "sonner";
import {
  useBrandShelf,
  useBrandMemberCounts,
  useSetShelfPublished,
  useDeleteShelfItem,
  useReorderShelf,
  APPROVAL_LABEL,
  type BrandShelfItem,
} from "@/hooks/useBrandShelf";

const ApprovalPill = ({ item }: { item: BrandShelfItem }) => {
  const tone =
    item.approval_status === "approved" ? "bg-primary/15 text-primary" :
    item.approval_status === "rejected" ? "bg-destructive/10 text-destructive" :
    "bg-warn/15 text-warn";
  return (
    <span className={`inline-flex items-center text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full font-body font-medium ${tone}`}>
      {APPROVAL_LABEL[item.approval_status] ?? item.approval_status}
    </span>
  );
};

const CountLine = ({
  label,
  value,
  suppressed,
  threshold,
}: { label: string; value: number | null; suppressed: boolean; threshold: number }) => (
  <div className="flex items-baseline justify-between">
    <span className="text-[11px] font-body text-muted-foreground">{label}</span>
    <span className="font-body text-[13px]">
      {value == null || suppressed ? (
        <span className="text-muted-foreground">Fewer than {threshold}</span>
      ) : (
        value
      )}
    </span>
  </div>
);

const BrandShelf = () => {
  const nav = useNavigate();
  const { data: items = [], isLoading } = useBrandShelf();
  const { data: counts = {} } = useBrandMemberCounts();
  const setPublished = useSetShelfPublished();
  const remove = useDeleteShelfItem();
  const reorder = useReorderShelf();

  const [addOpen, setAddOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const nextPosition = useMemo(
    () => (items.length ? Math.max(...items.map((i) => i.position ?? 0)) + 1 : 0),
    [items],
  );

  const goToEditor = (prefill: Record<string, unknown>) =>
    nav("/brand/shelf/new", { state: { prefill: { ...prefill, position: nextPosition } } });

  // Photo scan — same client-side HEIC→JPEG prep the member flow uses, then
  // hand off to the shared progress screen which invokes `product-analyse`.
  const handleScan = async (front: File, back: File) => {
    setBusy(true);
    try {
      const [pFront, pBack] = await Promise.all([prepareImageForAi(front), prepareImageForAi(back)]);
      setCaptureOpen(false);
      setAddOpen(false);
      nav("/brand/shelf/scanning", {
        state: {
          mode: "photos",
          position: nextPosition,
          front_image_data_url: pFront.dataUrl,
          back_image_data_url: pBack.dataUrl,
          front_preview_url: pFront.dataUrl,
          back_preview_url: pBack.dataUrl,
        },
      });
    } catch (e) {
      toast.error((e as Error).message || "Couldn't read those photos. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Product link — same normalisation and validation as the member flow,
  // then the shared progress screen invokes `product-analyse-url`.
  const handleLink = () => {
    let normalised = url.trim();
    if (!normalised) return;
    if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;
    try {
      new URL(normalised);
    } catch {
      toast.error("That doesn't look like a valid web link.");
      return;
    }
    setLinkOpen(false);
    setAddOpen(false);
    setUrl("");
    nav("/brand/shelf/scanning", {
      state: { mode: "link", url: normalised, position: nextPosition },
    });
  };


  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((row, i) => ({ id: row.id, position: i })));
  };

  if (isLoading) return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar title="Your shelf" />
      <div className="px-5 pb-10 space-y-4">
        <SurfaceCard className="p-4">
          <p className="font-body text-sm text-foreground/85 leading-relaxed">
            Your shelf is permanent. It stays on your brand page whether or not you have a
            campaign running, and members can add anything on it straight to their own shelf.
          </p>
          <Button className="mt-3 w-full rounded-pill" onClick={() => setAddOpen(true)}>
            <Plus className="size-4 mr-1.5" /> Add a product
          </Button>
        </SurfaceCard>

        <div>
          <SectionLabel className="!px-0">Products & tools</SectionLabel>
          {items.length === 0 ? (
            <EmptyState icon="✦" message="Nothing on your shelf yet" tone="card" />
          ) : (
            <div className="space-y-2">
              {items.map((item, index) => {
                const c = counts[item.id];
                return (
                  <SurfaceCard key={item.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display text-[15px] leading-tight truncate">{item.name}</p>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <ApprovalPill item={item} />
                          <span className="text-[10px] uppercase tracking-[0.14em] font-body text-muted-foreground">
                            {item.kind === "tool" ? "Tool" : "Product"}
                          </span>
                          {item.is_published ? (
                            <span className="text-[10.5px] font-body text-muted-foreground">On your page</span>
                          ) : (
                            <span className="text-[10.5px] font-body text-muted-foreground">Hidden</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          aria-label="Move up"
                          className="p-1.5 rounded-full border border-border text-muted-foreground disabled:opacity-40"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          aria-label="Move down"
                          className="p-1.5 rounded-full border border-border text-muted-foreground disabled:opacity-40"
                          disabled={index === items.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {item.approval_status === "rejected" && item.rejection_reason && (
                      <p className="mt-2 text-[12px] font-body text-destructive leading-snug">
                        {item.rejection_reason}
                      </p>
                    )}

                    <div className="mt-3 pt-3 border-t border-border/60 space-y-1">
                      <CountLine label="On members' shelves" value={c?.shelf_count ?? null} suppressed={c?.suppressed ?? true} threshold={c?.min_threshold ?? 50} />
                      <CountLine label="Saved to wishlists" value={c?.wishlist_count ?? null} suppressed={c?.suppressed ?? true} threshold={c?.min_threshold ?? 50} />
                      <CountLine label="Marked a favourite" value={c?.favourite_count ?? null} suppressed={c?.suppressed ?? true} threshold={c?.min_threshold ?? 50} />
                    </div>

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className="rounded-pill" onClick={() => nav(`/brand/shelf/${item.id}`)}>
                        <PencilLine className="size-3.5 mr-1" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-pill"
                        disabled={item.approval_status !== "approved"}
                        onClick={() => setPublished.mutate({ id: item.id, published: !item.is_published })}
                      >
                        {item.is_published ? <EyeOff className="size-3.5 mr-1" /> : <Eye className="size-3.5 mr-1" />}
                        {item.is_published ? "Hide" : "Show"}
                      </Button>
                      {item.external_url && (
                        <a
                          href={item.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] font-body text-primary"
                        >
                          Buy link <ExternalLink className="size-3 opacity-60" />
                        </a>
                      )}
                      <button
                        aria-label="Remove product"
                        className="ml-auto p-1.5 text-muted-foreground"
                        onClick={() => remove.mutate(item.id)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </SurfaceCard>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* How do you want to add it? */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="font-display">Add a product</SheetTitle>
            <SheetDescription className="font-body">
              We read the ingredient list the same way we read it for members.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2 pb-4">
            <Button variant="outline" className="w-full rounded-pill justify-start" onClick={() => { setAddOpen(false); setCaptureOpen(true); }}>
              <Camera className="size-4 mr-2" /> Scan the label
            </Button>
            <Button variant="outline" className="w-full rounded-pill justify-start" onClick={() => { setAddOpen(false); setLinkOpen(true); }}>
              <Link2 className="size-4 mr-2" /> Paste a product link
            </Button>
            <Button variant="outline" className="w-full rounded-pill justify-start" onClick={() => { setAddOpen(false); goToEditor({ ingredients_source: "manual", source_type: "manual" }); }}>
              <PencilLine className="size-4 mr-2" /> Enter the details yourself
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <DualPhotoCaptureSheet
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        onSubmit={handleScan}
        busy={busy}
        preferCamera={false}
      />

      <Sheet open={linkOpen} onOpenChange={setLinkOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="font-display">Paste a product link</SheetTitle>
            <SheetDescription className="font-body">
              Use the page on your own site that lists the full ingredients.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3 pb-4">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              inputMode="url"
              autoCapitalize="none"
            />
            <Button className="w-full rounded-pill" disabled={!url.trim()} onClick={handleLink}>
              Read this page
            </Button>

          </div>
        </SheetContent>
      </Sheet>
    </ScreenLayout>
  );
};

export default BrandShelf;
