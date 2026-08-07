// Brand shelf — the brand's permanent product catalogue.
//
// Adding a product reuses the member-side intelligence end to end: the link
// route calls the same `product-analyse-url` function a member's pasted link
// calls. Brands get two routes only — paste a link, or enter it themselves.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Link2, PencilLine, Eye, EyeOff, Trash2, ArrowUp, ArrowDown, ExternalLink } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductThumb from "@/components/ProductThumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { normaliseProductUrl } from "@/lib/brandLinkScan";
import { toast } from "sonner";
import {
  useBrandShelf,
  useBrandMemberCounts,
  useSetShelfPublished,
  useDeleteShelfItem,
  useReorderShelf,
  APPROVAL_LABEL,
  type BrandShelfItem,
  type BrandMemberCount,
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

const CountLine = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-baseline justify-between">
    <span className="text-[11px] font-body text-muted-foreground">{label}</span>
    <span className="font-body text-[13px]">{value}</span>
  </div>
);

/**
 * Member activity. The 50-member privacy threshold is enforced in the
 * database — anything below it comes back NULL. Rather than repeat an absent
 * number three times, we show one quiet line until there's something real.
 */
const MemberActivity = ({ c }: { c: BrandMemberCount | undefined }) => {
  const shown = [
    { label: "On members' shelves", value: c?.shelf_count },
    { label: "Saved to wishlists", value: c?.wishlist_count },
    { label: "Marked a favourite", value: c?.favourite_count },
  ].filter((r) => typeof r.value === "number") as { label: string; value: number }[];

  if (c?.suppressed !== false || shown.length === 0) {
    return (
      <p className="text-[11px] font-body text-muted-foreground leading-snug">
        Member activity will appear here once enough members have engaged.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {shown.map((r) => (
        <CountLine key={r.label} label={r.label} value={r.value} />
      ))}
    </div>
  );
};

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

  // Product link — same normalisation and validation as the member flow,
  // then the shared progress screen invokes `product-analyse-url`.
  const handleLink = () => {
    const normalised = normaliseProductUrl(url);
    if (!normalised) {
      if (url.trim()) toast.error("That doesn't look like a valid web link.");
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
                      <div className="flex items-start gap-3 min-w-0">
                        <ProductThumb
                          imageUrl={item.image_urls?.[0] ?? null}
                          alt={item.name}
                          name={item.name}
                          cover
                          wrapperClassName="size-14 rounded-[10px] overflow-hidden bg-muted shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-display text-[15px] leading-tight break-words">{item.name}</p>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <ApprovalPill item={item} />
                            <span className="text-[10px] uppercase tracking-[0.14em] font-body text-muted-foreground">
                              {item.kind === "tool" ? "Tool" : item.kind === "supplement" ? "Supplement" : "Product"}
                            </span>
                            {item.is_published ? (
                              <span className="text-[10.5px] font-body text-muted-foreground">On your page</span>
                            ) : (
                              <span className="text-[10.5px] font-body text-muted-foreground">Hidden</span>
                            )}
                          </div>
                          {item.description && (
                            <p className="mt-1 text-[12px] font-body text-muted-foreground leading-snug break-words line-clamp-2">
                              {item.description}
                            </p>
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
                      <p className="mt-2 text-[12px] font-body text-destructive leading-snug break-words">
                        {item.rejection_reason}
                      </p>
                    )}

                    <div className="mt-3 pt-3 border-t border-border/60">
                      <MemberActivity c={c} />
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
            <Button variant="outline" className="w-full rounded-pill justify-start" onClick={() => { setAddOpen(false); setLinkOpen(true); }}>
              <Link2 className="size-4 mr-2" /> Paste a product link
            </Button>
            <Button variant="outline" className="w-full rounded-pill justify-start" onClick={() => { setAddOpen(false); goToEditor({ ingredients_source: "manual", source_type: "manual" }); }}>
              <PencilLine className="size-4 mr-2" /> Enter the details yourself
            </Button>
          </div>
        </SheetContent>
      </Sheet>



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
