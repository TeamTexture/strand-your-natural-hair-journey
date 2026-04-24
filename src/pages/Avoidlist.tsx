import { useState } from "react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import ItalicSub from "@/components/ItalicSub";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Row { tone: "bad" | "warn"; name: string; body: string; icon: string }
const avoid: Row[] = [
  { tone: "bad", name: "Isopropyl Alcohol", body: "In 3 products rated 1-2★ · Causes dryness", icon: "🚫" },
  { tone: "warn", name: "Mineral Oil", body: "Linked to 2 poor wash days · May clog follicles", icon: "⚠️" },
  { tone: "bad", name: "Sodium Lauryl Sulfate", body: "Strips moisture · Scalp dryness noted", icon: "🚫" },
];

const Avoidlist = () => {
  const [tab, setTab] = useState<"avoid" | "fav">("avoid");
  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Ingredient Intel" />
      <ItalicSub>Based on your ratings and feedback across 14 products. Updates automatically.</ItalicSub>

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
              {t === "avoid" ? "Avoid" : "Favourites"}
            </button>
          ))}
        </div>
      </div>

      {tab === "avoid" ? (
        <div className="px-5 space-y-3 pb-4">
          {avoid.map((r) => (
            <SurfaceCard key={r.name} className="flex items-center gap-3">
              <span className={cn("size-2.5 rounded-full shrink-0", r.tone === "bad" ? "bg-destructive" : "bg-warn")} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">{r.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{r.body}</p>
              </div>
              <span className="text-xl">{r.icon}</span>
            </SurfaceCard>
          ))}
        </div>
      ) : (
        <div className="px-5 pb-4 space-y-3">
          <SurfaceCard className="flex items-center gap-3">
            <span className="size-2.5 rounded-full bg-good shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Castor Oil</p>
              <p className="text-[11px] text-muted-foreground">In 5 products rated 4-5★</p>
            </div>
            <span className="text-xl">💛</span>
          </SurfaceCard>
        </div>
      )}

      <div className="px-5 pb-6 space-y-3">
        <SurfaceCard tone="gold">
          <p className="text-xs font-semibold mb-1">🤖 AI Insight</p>
          <p className="text-sm leading-snug text-foreground/85">
            Alcohol-based ingredients consistently appear in your lowest-rated products. Your high-porosity hair loses moisture rapidly with these present — compounded by your low ferritin levels.
          </p>
        </SurfaceCard>

        <Button variant="gold" size="pill" onClick={() => toast("Ingredient report exported as PDF")}>
          Export Report for Professional
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default Avoidlist;
