// TEMPORARY design preview — deleted after the screenshot check.
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import StatusCallout from "@/components/guidance/StatusCallout";
import AiProgressBar from "@/components/AiProgressBar";
import ProductPhotoTile from "@/components/ProductPhotoTile";
import { Heart } from "lucide-react";
import { formatIngredientName } from "@/lib/ingredientName";

const NAMES = [
  "WATER (AQUA)", "BUTYROSPERMUM PARKII (SHEA) BUTTER*♥", "COCOS NUCIFERA (COCONUT) OIL",
  "CETEARYL ALCOHOL", "BEHENTRIMONIUM METHOSULFATE", "GLYCERIN", "PEG-40 HYDROGENATED CASTOR OIL",
  "HYDROLYZED WHEAT PROTEIN", "MEL (HONEY)*", "PANTHENOL", "CITRIC ACID", "PHENOXYETHANOL",
];

const DesignPreviewTmp = () => (
  <ScreenLayout bottomNav>
    <TitleBar title="Product" />
    <div className="px-5 pb-8 space-y-4">
      <div className="flex flex-col items-center text-center pt-1 pb-2">
        <ProductPhotoTile imageUrl={null} fallbackEmoji="🧴" size="size-56" className="mb-3" />
        <div className="relative w-full px-9">
          <h1 className="font-display text-xl font-semibold leading-tight text-center break-words [overflow-wrap:anywhere]">
            Strengthen and Restore Conditioner Manuka Honey &amp; Yogurt
          </h1>
          <button type="button" aria-label="Add to favourites" className="absolute right-0 top-0 p-1">
            <Heart className="size-6 text-muted-foreground" />
          </button>
        </div>
        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-primary">SheaMoisture</p>
        <p className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">On your shelf</p>
      </div>

      <SurfaceCard className="space-y-3">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/60">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Last used</span>
            <span className="text-sm font-medium">Never</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Times used</span>
            <span className="text-sm font-medium">0</span>
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">Rating</p>
          <p className="text-xs text-muted-foreground italic">Awaiting analysis</p>
        </div>
      </SurfaceCard>

      <StatusCallout tone="gold" label="Verdict">
        <p className="font-body text-[13px] text-foreground/75">
          We've read your label and {NAMES.length} ingredients. Your breakdown is being written now.
          You can close this and carry on — it keeps going, and it'll be here when you come back.
        </p>
        <AiProgressBar
          className="mt-3"
          expectedMs={60000}
          stages={["Reading the verified ingredient list", "Looking each ingredient up in the manuscript"]}
        />
      </StatusCallout>

      <SectionLabel>Ingredients</SectionLabel>
      <div className="rounded-2xl bg-white border border-border/60 p-4">
        <div className="flex flex-wrap gap-1.5">
          {NAMES.map((n) => (
            <span key={n} className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/25 text-foreground/70 text-[11px] font-medium leading-tight">
              {formatIngredientName(n)}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {NAMES.length} of {NAMES.length} ingredients read. Tap to explore each one once your breakdown lands.
        </p>
      </div>

      <SectionLabel>Your voicenotes</SectionLabel>
      <SurfaceCard>
        <p className="text-xs text-muted-foreground italic">No voicenotes yet.</p>
      </SurfaceCard>
    </div>
  </ScreenLayout>
);

export default DesignPreviewTmp;
