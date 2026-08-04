import { useEffect, useState } from "react";
import { ExternalLink, Home, Info } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { matchedMarkers, priceLabel, type BrandBloodPanel } from "@/lib/bloodTestBrands";

/**
 * THE shared brand blood panel row. Every surface that offers an at-home blood
 * test renders this component.
 *
 * COMPLIANCE: when `affiliate_url` is populated the commission disclosure
 * renders automatically, driven off the presence of that field alone. It is not
 * a prop and cannot be switched off, so a brand added later can never end up on
 * screen without its disclosure.
 */

export const AFFILIATE_DISCLOSURE =
  "STRAND may earn a commission if you buy through this link.";

const BrandBloodPanelRow = ({
  panel,
  neededMarkers = [],
  className,
}: {
  panel: BrandBloodPanel;
  neededMarkers?: string[];
  className?: string;
}) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!panel.logo_path) {
      setLogoUrl(null);
      return;
    }
    supabase.storage
      .from("brand-assets")
      .createSignedUrl(panel.logo_path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setLogoUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [panel.logo_path]);

  const isAffiliate = !!panel.affiliate_url?.trim();
  const href = (panel.affiliate_url || panel.purchase_url || "").trim();
  const price = priceLabel(panel.price_from, panel.currency);
  const matches = matchedMarkers(panel, neededMarkers);

  return (
    <SurfaceCard className={cn("space-y-2", className)}>
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-[10px] bg-muted border border-border overflow-hidden shrink-0 flex items-center justify-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${panel.brand_name} logo`}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="font-display text-[13px] text-muted-foreground">
              {panel.brand_name.slice(0, 1)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold leading-tight truncate">
            {panel.brand_name}
          </p>
          <p className="text-[11.5px] font-body text-foreground/75 leading-snug">
            {panel.panel_name}
          </p>
        </div>
        {price && (
          <span className="shrink-0 text-[11px] font-body font-semibold text-foreground/85">
            {price}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-body">
          <Home className="size-3" aria-hidden="true" /> Kit posted to you
        </span>
        {matches.map((m) => (
          <span
            key={m}
            className="rounded-full bg-good/15 px-2 py-0.5 text-[10px] font-body text-good font-medium"
          >
            Covers {m}
          </span>
        ))}
        {panel.regions_served.map((r) => (
          <span
            key={r}
            className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-body text-foreground/80"
          >
            {r}
          </span>
        ))}
      </div>

      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer sponsored"
          aria-label={`Buy the ${panel.panel_name} from ${panel.brand_name} — opens in a new tab`}
          className="inline-flex items-center gap-1.5 rounded-pill bg-primary px-4 py-2 text-[12px] font-body font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Buy from {panel.brand_name}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}

      {/* Driven purely off the presence of an affiliate link. */}
      {isAffiliate && (
        <p className="flex items-start gap-1.5 text-[10px] font-body text-muted-foreground leading-snug">
          <Info className="size-3 mt-0.5 shrink-0" aria-hidden="true" />
          {AFFILIATE_DISCLOSURE}
        </p>
      )}
    </SurfaceCard>
  );
};

export default BrandBloodPanelRow;
