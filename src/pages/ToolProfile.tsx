// Full profile page for a tool the member has saved (mirrors the product
// profile page). Reached from the tool thumbnails in the Style Record steps and
// from My Tools. Shows the scraped photo, name, brand, category, the
// personalised match stars and the saved STRAND read, plus the actions to keep
// it in My Tools, favourite it, or open the original page.
import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ExternalLink, Heart, Sparkles, Wrench } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import ProductThumb from "@/components/ProductThumb";
import MatchStars from "@/components/MatchStars";
import ToolGuidanceCard from "@/components/tools/ToolGuidanceCard";
import { ToolAdviceDialog } from "@/components/ToolAdviceDialog";
import { Button } from "@/components/ui/button";
import { useUserTools } from "@/hooks/useUserTools";
import { matchScoreOf } from "@/lib/matchStars";
import { cn } from "@/lib/utils";

const ToolProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tools, loading, updateTool, setFavourite } = useUserTools();
  const [adviceOpen, setAdviceOpen] = useState(false);

  const tool = useMemo(() => tools.find((t) => t.id === id) ?? null, [tools, id]);
  const score = matchScoreOf(tool);
  const analysis = (tool?.ai_analysis ?? null) as Record<string, unknown> | null;

  if (loading) {
    return (
      <ScreenLayout>
        <TitleBar title="Tool" backFallback="/products" />
        <div className="py-16">
          <LoadingDot />
        </div>
      </ScreenLayout>
    );
  }

  if (!tool) {
    return (
      <ScreenLayout>
        <TitleBar title="Tool" backFallback="/products" />
        <div className="px-4 py-10 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            We couldn't find that tool in your collection.
          </p>
          <Button variant="goldGhost" size="sm" onClick={() => navigate("/products")}>
            Go to My Products
          </Button>
        </div>
      </ScreenLayout>
    );
  }

  const owned = !tool.on_wishlist;

  return (
    <ScreenLayout contentClassName="pb-10">
      <TitleBar title="Tool" backFallback="/products" />

      <div className="px-4 space-y-3">
        <SurfaceCard className="p-4">
          <div className="flex gap-3">
            <ProductThumb
              imageUrl={tool.image_url}
              storagePath={tool.storage_path}
              alt={tool.name}
              brand={tool.brand}
              name={tool.name}
              cover
              wrapperClassName="size-[84px] rounded-[12px] overflow-hidden bg-secondary shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[19px] leading-tight [overflow-wrap:anywhere]">
                {tool.name}
              </h1>
              {tool.brand && (
                <p className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
                  {tool.brand}
                </p>
              )}
              {tool.category && (
                <p className="mt-1 inline-block rounded-pill bg-secondary px-2.5 py-0.5 text-[11px] text-foreground/70">
                  {tool.category}
                </p>
              )}
              {score != null && (
                <div className="mt-2">
                  <MatchStars score={score} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={owned ? "secondary" : "default"}
              className="h-9"
              onClick={() => void updateTool(tool.id, { on_wishlist: !owned, on_shelf: owned ? tool.on_shelf : true })}
            >
              <Wrench className="size-4 mr-1.5" />
              {owned ? "In my tools" : "Add to my tools"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="goldGhost"
              className="h-9"
              onClick={() => void setFavourite(tool.id, !tool.on_favourite)}
            >
              <Heart className={cn("size-4 mr-1.5", tool.on_favourite && "fill-current")} />
              {tool.on_favourite ? "Favourite" : "Add to favourites"}
            </Button>
            {tool.source_url && (
              <Button asChild size="sm" variant="goldGhost" className="h-9">
                <a href={tool.source_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4 mr-1.5" />
                  View original page
                </a>
              </Button>
            )}
          </div>
        </SurfaceCard>

        <ToolGuidanceCard tool={tool} />

        {scoreReasons.length > 0 && (
          <SurfaceCard className="p-4 space-y-2">
            <SectionLabel>Why it rates this for your hair</SectionLabel>
            <ul className="space-y-2">
              {scoreReasons.map((r) => (
                <li key={r.factor} className="flex gap-2">
                  {r.direction === "minus" ? (
                    <AlertTriangle className="mt-[3px] size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Check className="mt-[3px] size-3.5 shrink-0 text-primary" />
                  )}
                  <p className="text-[12.5px] font-body leading-snug text-foreground/85 [overflow-wrap:anywhere]">
                    <span className="font-display text-[13px] text-foreground">{r.factor}</span>
                    {r.reason ? ` — ${r.reason}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </SurfaceCard>
        )}

        {features.length > 0 && (
          <SurfaceCard className="p-4 space-y-2">
            <SectionLabel>What it does</SectionLabel>
            <ul className="space-y-2">
              {features.map((f) => (
                <li key={f.name}>
                  <p className="font-display text-[13.5px] leading-tight [overflow-wrap:anywhere]">
                    {f.name}
                  </p>
                  {f.detail && (
                    <p className="text-[12.5px] font-body leading-snug text-foreground/80 [overflow-wrap:anywhere]">
                      {f.detail}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </SurfaceCard>
        )}

        {useCases.length > 0 && (
          <SurfaceCard className="p-4 space-y-2">
            <SectionLabel>Using it on your hair</SectionLabel>
            <ol className="space-y-2">
              {useCases.map((u, i) => (
                <li key={`${i}-${u.slice(0, 12)}`} className="flex gap-2">
                  <span className="mt-[1px] text-[11px] font-body font-semibold text-primary">
                    {i + 1}
                  </span>
                  <p className="text-[12.5px] font-body leading-snug text-foreground/85 [overflow-wrap:anywhere]">
                    {u}
                  </p>
                </li>
              ))}
            </ol>
          </SurfaceCard>
        )}

        {cautions.length > 0 && (
          <SurfaceCard className="p-4 space-y-2">
            <SectionLabel>Using it safely</SectionLabel>
            <ul className="space-y-2">
              {cautions.map((w) => (
                <li key={w.slice(0, 16)} className="flex gap-2">
                  <AlertTriangle className="mt-[3px] size-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-[12.5px] font-body leading-snug text-foreground/80 [overflow-wrap:anywhere]">
                    {w}
                  </p>
                </li>
              ))}
            </ul>
          </SurfaceCard>
        )}

        {tool.notes && (
          <SurfaceCard className="p-4 space-y-1.5">
            <SectionLabel>Notes</SectionLabel>
            <p className="text-[13px] leading-relaxed text-foreground/80 whitespace-pre-line">
              {tool.notes}
            </p>
          </SurfaceCard>
        )}


        {analysis && (
          <Button
            type="button"
            variant="goldGhost"
            className="h-11 w-full"
            onClick={() => setAdviceOpen(true)}
          >
            <Sparkles className="size-4 mr-1.5" />
            How to use it for your hair
          </Button>
        )}
      </div>

      <ToolAdviceDialog
        open={adviceOpen}
        onOpenChange={setAdviceOpen}
        payload={analysis}
        title={tool.name}
        primaryLabel={tool.brand ?? "Tool"}
      />
    </ScreenLayout>
  );
};

export default ToolProfile;
