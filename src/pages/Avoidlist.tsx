import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Flag } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import ItalicSub from "@/components/ItalicSub";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductsHeader, { useProductsFilterState } from "@/components/ProductsHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIngredientLists } from "@/hooks/useIngredientLists";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";
import { useAuth } from "@/hooks/useAuth";
import { useIngredientProfile } from "@/hooks/useIngredientProfile";
import { generateIngredientReportPdf } from "@/lib/ingredientReportPdf";
import { supabase } from "@/integrations/supabase/client";

const Avoidlist = () => {
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { flags, loading } = useIngredientLists();
  const { allProducts } = useUserProducts("all");
  const { user } = useAuth();
  const navigate = useNavigate();

  const filterState = useProductsFilterState();
  const filteredFlags = useMemo(() => {
    const q = filterState.search.trim().toLowerCase();
    if (!q) return flags;
    return flags.filter(
      (f) =>
        f.ingredient.toLowerCase().includes(q) ||
        f.reason.toLowerCase().includes(q),
    );
  }, [flags, filterState.search]);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      let userName = "STRAND Member";
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", user.id)
          .maybeSingle();
        userName =
          profile?.display_name?.trim() ||
          user.email?.split("@")[0] ||
          userName;
      }
      const { blob, fileName } = generateIngredientReportPdf({ userName, flags });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Ingredient report downloaded");
    } catch (e) {
      console.error("PDF export failed", e);
      toast.error("Could not generate PDF — please try again");
    } finally {
      setExporting(false);
    }
  };

  /** Find products in the user's library that contain a given ingredient. */
  const productsForIngredient = (ingredient: string) => {
    const needle = ingredient.trim().toLowerCase();
    return allProducts.filter((p) =>
      (p.ingredients ?? []).some((i) => i.toLowerCase().includes(needle)),
    );
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Ingredient Analysis" />
      <ItalicSub>
        Built automatically from the products you've put on your shelf,
        favourited, AND actively used. An ingredient earns a{" "}
        <span className="text-primary font-medium">flag</span> when it shows up
        in 3 or more of those products. Tap any flag to learn what the
        ingredient is, what it does, and which of your products contain it —
        purely educational, no good or bad.
      </ItalicSub>

      {loading ? (
        <div className="px-5 pb-4">
          <SurfaceCard>
            <LoadingDot label="Loading your flagged ingredients…" />
          </SurfaceCard>
        </div>
      ) : (
        <div className="px-5 space-y-3 pb-4">
          {flags.length === 0 ? (
            <EmptyState
              message="No flagged ingredients yet"
              hint="Favourite 3 or more products on your shelf that share an ingredient — once you've used them at least once, they'll appear here."
            />
          ) : (
            flags.map((r) => {
              const isOpen = expanded === r.id;
              const matches = isOpen ? productsForIngredient(r.ingredient) : [];
              return (
                <IngredientRow
                  key={r.id}
                  row={r}
                  isOpen={isOpen}
                  matches={matches}
                  onToggle={() => setExpanded(isOpen ? null : r.id)}
                  onProductClick={(id) => navigate(`/products/profile/${id}`)}
                />
              );
            })
          )}
        </div>
      )}

      {flags.length > 0 && (
        <div className="px-5 pb-6">
          <Button
            variant="gold"
            size="pill"
            onClick={handleExport}
            disabled={exporting || loading}
          >
            {exporting ? "Generating PDF…" : "Export Report for Professional"}
          </Button>
        </div>
      )}
    </ScreenLayout>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// IngredientRow — single row inside the flagged-ingredient list. Owns its
// own AI profile fetch so the request only fires when the user expands the
// row. React Query caches per (user, ingredient) and the edge function
// caches in ai_summaries, so re-opening the same row is instant.
// ─────────────────────────────────────────────────────────────────────────
interface IngredientRowProps {
  row: { id: string; ingredient: string; reason: string };
  isOpen: boolean;
  matches: UserProduct[];
  onToggle: () => void;
  onProductClick: (productId: string) => void;
}

const IngredientRow = ({
  row,
  isOpen,
  matches,
  onToggle,
  onProductClick,
}: IngredientRowProps) => {
  // Only fetch when the row is open. The hook respects this via `enabled`
  // so a closed row makes zero network calls.
  const profileQuery = useIngredientProfile(row.ingredient, row.reason, isOpen);

  return (
    <SurfaceCard className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <Flag
          className="size-4 fill-current shrink-0"
          style={{ color: "hsl(40 65% 32%)" }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{row.ingredient}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{row.reason}</p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div className="border-t border-border bg-muted/30 px-3 py-3 space-y-3">
          {/* AI profile — what it is, benefits, personalised notes */}
          <div className="space-y-2">
            {profileQuery.isLoading && (
              <p className="text-[11px] text-muted-foreground italic">
                Building your personalised ingredient profile…
              </p>
            )}
            {profileQuery.isError && (
              <p className="text-[11px] text-destructive">
                Couldn't load profile — pull down to refresh and try again.
              </p>
            )}
            {profileQuery.data && (
              <div className="space-y-2.5">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">
                    What it is
                  </p>
                  <p className="text-xs leading-snug">
                    {profileQuery.data.what_it_is}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">
                    What it does
                  </p>
                  <ul className="text-xs leading-snug space-y-1 pl-3 list-disc marker:text-muted-foreground">
                    {profileQuery.data.benefits.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">
                    For your hair specifically
                  </p>
                  <ul className="text-xs leading-snug space-y-1 pl-3 list-disc marker:text-muted-foreground">
                    {profileQuery.data.personal_notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Matching products from the user's library */}
          <div className="space-y-1.5 pt-2 border-t border-border/60">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              In your products
            </p>
            {matches.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-1">
                No matching products found.
              </p>
            ) : (
              matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  // Use the SAME canonical product route as the My Products list
                  // (Products.tsx → /products/profile/:id), which redirects to
                  // /products/ingredient. Going through the redirect guarantees
                  // every entry-point lands on the unified product page.
                  onClick={() => onProductClick(p.id)}
                  className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-background text-left transition-colors"
                >
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt=""
                      className="size-8 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="size-8 rounded bg-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{p.name}</p>
                    {p.brand && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {p.brand}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">›</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </SurfaceCard>
  );
};

export default Avoidlist;
