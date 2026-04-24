import { useMemo, useState } from "react";
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
import { useAuth } from "@/hooks/useAuth";
import { generateIngredientReportPdf } from "@/lib/ingredientReportPdf";
import { supabase } from "@/integrations/supabase/client";

const Avoidlist = () => {
  const [tab, setTab] = useState<"avoid" | "fav">("avoid");
  const [exporting, setExporting] = useState(false);
  const { avoid, favourites, loading } = useIngredientLists();
  const { user } = useAuth();

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // Pull display name from profile so the report is personalised; fall
      // back to email local-part, then a generic label.
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

  // Tone the dot red when an ingredient appears in 3+ lowest-rated products,
  // amber for the 2-product threshold case.
  const toneFor = (count: number) => (count >= 3 ? "bad" : "warn");

  const totalProducts = useMemo(
    () => avoid.length + favourites.length,
    [avoid.length, favourites.length],
  );

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Ingredient Analysis" />
      <ItalicSub>
        Built automatically from your product ratings. Rate products 1-2★ to
        grow Avoid, 4-5★ to grow Favourites.
      </ItalicSub>

      <div className="px-5 pb-4">
        <div className="grid grid-cols-2 gap-1 p-1 bg-card border border-border rounded-[10px]">
          {(["avoid", "fav"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "py-2 text-xs rounded-md font-medium transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t === "avoid" ? `Avoid (${avoid.length})` : `Favourites (${favourites.length})`}
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
              message="Nothing to avoid yet"
              hint="Rate two or more products 1-2★ and shared ingredients will appear here."
            />
          ) : (
            avoid.map((r) => {
              const tone = toneFor(r.product_count);
              return (
                <SurfaceCard key={r.id} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "size-2.5 rounded-full shrink-0",
                      tone === "bad" ? "bg-destructive" : "bg-warn",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{r.ingredient}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{r.reason}</p>
                  </div>
                  <span className="text-xl">{tone === "bad" ? "🚫" : "⚠️"}</span>
                </SurfaceCard>
              );
            })
          )}
        </div>
      ) : (
        <div className="px-5 pb-4 space-y-3">
          {favourites.length === 0 ? (
            <EmptyState
              message="No favourites yet"
              hint="Rate two or more products 4-5★ and shared ingredients will appear here."
            />
          ) : (
            favourites.map((r) => (
              <SurfaceCard key={r.id} className="flex items-center gap-3">
                <span className="size-2.5 rounded-full bg-good shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.ingredient}</p>
                  <p className="text-[11px] text-muted-foreground">{r.reason}</p>
                </div>
                <span className="text-xl">💛</span>
              </SurfaceCard>
            ))
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
