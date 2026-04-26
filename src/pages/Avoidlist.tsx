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

  const totalProducts = useMemo(
    () => avoid.length + favourites.length,
    [avoid.length, favourites.length],
  );

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
              onClick={() => setTab(t)}
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
            avoid.map((r) => (
              <SurfaceCard key={r.id} className="flex items-center gap-3">
                <span className="size-2.5 rounded-full bg-destructive shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{r.ingredient}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{r.reason}</p>
                </div>
                <span className="text-xl">🚩</span>
              </SurfaceCard>
            ))
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
            favourites.map((r) => (
              <SurfaceCard key={r.id} className="flex items-center gap-3">
                <span className="size-2.5 rounded-full bg-good shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.ingredient}</p>
                  <p className="text-[11px] text-muted-foreground">{r.reason}</p>
                </div>
                <span className="text-xl">💚</span>
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
