import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import ItalicSub from "@/components/ItalicSub";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIngredientLists } from "@/hooks/useIngredientLists";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useAuth } from "@/hooks/useAuth";
import { generateIngredientReportPdf } from "@/lib/ingredientReportPdf";
import { supabase } from "@/integrations/supabase/client";

const Avoidlist = () => {
  const [tab, setTab] = useState<"avoid" | "fav">("avoid");
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { avoid, favourites, loading } = useIngredientLists();
  const { allProducts } = useUserProducts("all");
  const { user } = useAuth();
  const navigate = useNavigate();

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
      const { blob, fileName } = generateIngredientReportPdf({ userName, avoid, favourites });
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

  const totalProducts = useMemo(
    () => avoid.length + favourites.length,
    [avoid.length, favourites.length],
  );

  /** Find products in the user's library that contain a given ingredient,
   * filtered by which list (favourite vs off-shelf) the row belongs to. */
  const productsForIngredient = (ingredient: string, kind: "avoid" | "fav") => {
    const needle = ingredient.trim().toLowerCase();
    return allProducts.filter((p) => {
      const inList = kind === "fav"
        ? p.on_favourite
        : !p.on_shelf && p.previously_on_shelf;
      if (!inList) return false;
      return (p.ingredients ?? []).some((i) => i.toLowerCase().includes(needle));
    });
  };

  const renderRow = (
    r: { id: string; ingredient: string; reason: string },
    kind: "avoid" | "fav",
  ) => {
    const isOpen = expanded === r.id;
    const matches = isOpen ? productsForIngredient(r.ingredient, kind) : [];
    const dotClass = kind === "fav" ? "bg-good" : "bg-destructive";
    const emoji = kind === "fav" ? "💚" : "🚩";
    return (
      <SurfaceCard key={r.id} className="p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(isOpen ? null : r.id)}
          className="w-full flex items-center gap-3 p-3 text-left"
        >
          <span className={cn("size-2.5 rounded-full shrink-0", dotClass)} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-tight">{r.ingredient}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{r.reason}</p>
          </div>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              isOpen && "rotate-180",
            )}
          />
          <span className="text-xl">{emoji}</span>
        </button>
        {isOpen && (
          <div className="border-t border-border bg-muted/30 px-3 py-2 space-y-1.5">
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
                  // every entry-point lands on the unified product page in the
                  // exact same way — no risk of a key/name/brand mismatch
                  // making the page render in a half-loaded state.
                  onClick={() => navigate(`/products/profile/${p.id}`)}
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
        )}
      </SurfaceCard>
    );
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Ingredient Analysis" />
      <ItalicSub>
        Built automatically from your products. An ingredient becomes a{" "}
        <span className="text-good font-medium">Green Flag</span> when it appears in
        3 or more of your favourited products, and a{" "}
        <span className="text-destructive font-medium">Red Flag</span> when it
        appears in 3 or more products you've taken off your shelf.
      </ItalicSub>

      <div className="px-5 pb-4">
        <div className="grid grid-cols-2 gap-1 p-1 bg-card border border-border rounded-[10px]">
          {(["fav", "avoid"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setExpanded(null); }}
              className={cn(
                "py-2 text-xs rounded-md font-medium transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t === "fav"
                ? `Green Flag (${favourites.length})`
                : `Red Flag (${avoid.length})`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="px-5 pb-4">
          <SurfaceCard>
            <LoadingDot label="Loading your ingredient lists…" />
          </SurfaceCard>
        </div>
      ) : tab === "avoid" ? (
        <div className="px-5 space-y-3 pb-4">
          {avoid.length === 0 ? (
            <EmptyState
              message="No Red Flags yet"
              hint="Take 3 or more products off the shelf and any ingredient they share will appear here."
            />
          ) : (
            avoid.map((r) => renderRow(r, "avoid"))
          )}
        </div>
      ) : (
        <div className="px-5 pb-4 space-y-3">
          {favourites.length === 0 ? (
            <EmptyState
              message="No Green Flags yet"
              hint="Tap the heart on 3 or more products that share an ingredient and it will appear here."
            />
          ) : (
            favourites.map((r) => renderRow(r, "fav"))
          )}
        </div>
      )}

      {totalProducts > 0 && (
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

export default Avoidlist;
