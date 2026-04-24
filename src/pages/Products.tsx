import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Mic, Link as LinkIcon, Loader2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductVoicenotes from "@/components/ProductVoicenotes";
import FilePickerButton from "@/components/FilePickerButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useVoicenoteCounts } from "@/hooks/useVoicenoteCounts";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useProductScan } from "@/hooks/useProductScan";
import { useProductUrlScan } from "@/hooks/useProductUrlScan";

const tabs = [
  { id: "shelf",    label: "Shelf" },
  { id: "wishlist", label: "Wishlist" },
  { id: "intel",    label: "Ingredients" },
];

const Stars = ({ n }: { n: number }) => (
  <span className="text-[10px] text-primary tracking-tight">
    {"★".repeat(n)}<span className="text-border">{"★".repeat(5 - n)}</span>
  </span>
);

const Products = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const { products, loading } = useUserProducts("shelf");
  const { counts } = useVoicenoteCounts(products.map(p => p.product_key));
  const { startScan, busy } = useProductScan();
  const { startUrlScan, busy: urlBusy } = useProductUrlScan();

  const goWishlist = () => navigate("/products/wishlist");
  const goIntel = () => navigate("/products/avoidlist");

  const handleLinkSubmit = async () => {
    await startUrlScan(linkValue, "shelf");
    setLinkSheetOpen(false);
    setLinkValue("");
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="My Products"
        back={false}
        right={
          <button onClick={() => navigate("/products/repository")} className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium px-2 min-h-[44px]">
            All Products
          </button>
        }
      />

      <div className="px-5 pb-4">
        <div className="grid grid-cols-3 gap-1 p-1 bg-card border border-border rounded-[10px]">
          {tabs.map((t) => {
            const active = t.id === "shelf";
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id === "wishlist") goWishlist();
                  else if (t.id === "intel") goIntel();
                }}
                className={cn(
                  "py-2 text-xs rounded-md font-medium transition-colors min-h-[40px] truncate px-1",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 space-y-3 pb-4">
        {loading ? (
          <LoadingDot label="Loading your shelf…" />
        ) : products.length === 0 ? (
          <EmptyState
            message="Your shelf is empty"
            hint="Scan or upload a product to get started."
          />
        ) : (
          products.map((p) => {
            const isOpen = expanded === p.product_key;
            const noteCount = counts[p.product_key] ?? 0;
            const score = p.match_score ?? 0;
            const stars = p.rating ?? 0;
            return (
              <div
                key={p.id}
                className="bg-card border border-border rounded-[14px] overflow-hidden"
              >
                <div className="p-3.5 flex items-center gap-3">
                  <div className="size-12 rounded-[10px] overflow-hidden bg-secondary shrink-0">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="size-full flex items-center justify-center text-2xl bg-primary/15">🧴</div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      navigate(
                        `/products/ingredient?key=${encodeURIComponent(p.product_key)}&name=${encodeURIComponent(p.name)}&brand=${encodeURIComponent(p.brand ?? "")}`,
                      )
                    }
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium font-body leading-tight truncate">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{p.brand}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Stars n={stars} />
                        {noteCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-primary font-medium">
                            <Mic className="size-3" /> {noteCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="size-10 rounded-full border-2 border-primary text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {score}
                    </div>
                  </button>
                  <button
                    onClick={() => setExpanded(isOpen ? null : p.product_key)}
                    className="size-11 rounded-full hover:bg-primary/10 flex items-center justify-center shrink-0"
                    aria-label={isOpen ? "Hide voicenotes" : "Show voicenotes"}
                    aria-expanded={isOpen}
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                </div>

                {isOpen && (
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-border/60">
                    <ProductVoicenotes
                      productKey={p.product_key}
                      productName={p.name}
                      productBrand={p.brand ?? ""}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="px-5 pb-6 space-y-3">
        <FilePickerButton variant="gold" size="pill" preferCamera disabled={busy || urlBusy} onPick={(f) => startScan(f, "shelf")}>
          {busy ? "Preparing photo…" : "+ Scan a New Product"}
        </FilePickerButton>
        <FilePickerButton variant="goldOutline" size="pill" disabled={busy || urlBusy} onPick={(f) => startScan(f, "shelf")}>
          + Upload Screenshot
        </FilePickerButton>
        <Button
          variant="goldOutline"
          size="pill"
          disabled={busy || urlBusy}
          onClick={() => setLinkSheetOpen(true)}
          className="w-full"
        >
          <LinkIcon className="size-4 mr-1.5" />
          {urlBusy ? "Reading link…" : "Paste Web Link"}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center leading-snug px-2">
          Tip: snap the bottle, upload a screenshot, or paste a product page
          link — the AI reads the label and matches ingredients to your hair
          profile.
        </p>
      </div>

      <Sheet open={linkSheetOpen} onOpenChange={(o) => !urlBusy && setLinkSheetOpen(o)}>
        <SheetContent side="bottom" className="rounded-t-[24px] pb-8">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display">Add product from a link</SheetTitle>
            <SheetDescription className="text-xs">
              Paste a product page URL from any retailer or brand site. The AI
              will read the page and pull the ingredients.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <Input
              type="url"
              inputMode="url"
              autoFocus
              placeholder="https://brand.com/products/curl-cream"
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && linkValue.trim() && !urlBusy) handleLinkSubmit();
              }}
              disabled={urlBusy}
              className="h-12 text-sm"
            />
            <Button
              variant="gold"
              size="pill"
              onClick={handleLinkSubmit}
              disabled={!linkValue.trim() || urlBusy}
              className="w-full"
            >
              {urlBusy ? (
                <><Loader2 className="size-4 mr-2 animate-spin" /> Reading page…</>
              ) : (
                "Analyse this link"
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Works best with direct product pages (not search results or home
              pages). If a page hides ingredients behind a tab, the AI may
              return only what's visible.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </ScreenLayout>
  );
};

export default Products;
