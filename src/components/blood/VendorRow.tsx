import { ExternalLink, Home, MapPin, Info } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { cn } from "@/lib/utils";
import type { BloodTestVendor } from "@/hooks/useBloodTestVendors";

/**
 * THE shared vendor row. Every surface that shows a blood test vendor renders
 * this component.
 *
 * COMPLIANCE: when `affiliate_url` is populated the commission disclosure is
 * rendered automatically, from the presence of that field. It is not a prop and
 * cannot be switched off, so a future surface cannot forget it.
 */

export const AFFILIATE_DISCLOSURE =
  "STRAND may earn a commission if you buy through this link.";

const priceLine = (v: BloodTestVendor) => {
  if (v.price_from == null) return null;
  const symbol = v.currency === "GBP" ? "£" : `${v.currency} `;
  return `From ${symbol}${Number(v.price_from).toFixed(2).replace(/\.00$/, "")}`;
};

const VendorRow = ({
  vendor,
  className,
  footer,
}: {
  vendor: BloodTestVendor;
  className?: string;
  footer?: React.ReactNode;
}) => {
  const isAffiliate = !!vendor.affiliate_url?.trim();
  const href = (vendor.affiliate_url || vendor.url || "").trim();
  const price = priceLine(vendor);

  return (
    <SurfaceCard className={cn("space-y-2", className)}>
      <div className="flex items-start gap-3">
        {vendor.logo_url ? (
          <img
            src={vendor.logo_url}
            alt={`${vendor.name} logo`}
            loading="lazy"
            className="size-10 rounded-[8px] object-contain bg-background shrink-0"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold leading-tight">{vendor.name}</p>
          {vendor.panel_name && (
            <p className="text-[11px] font-body text-muted-foreground leading-snug">
              {vendor.panel_name}
            </p>
          )}
        </div>
        {price && (
          <span className="shrink-0 text-[11px] font-body font-semibold text-foreground/85">
            {price}
          </span>
        )}
      </div>

      {vendor.short_description && (
        <p className="text-[11px] font-body text-foreground/80 leading-relaxed">
          {vendor.short_description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-body">
          {vendor.at_home ? (
            <>
              <Home className="size-3" aria-hidden="true" /> Kit posted to you
            </>
          ) : (
            <>
              <MapPin className="size-3" aria-hidden="true" /> Attend in person
            </>
          )}
        </span>
        {vendor.regions_served.map((r) => (
          <span
            key={r}
            className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-body text-foreground/80"
          >
            {r}
          </span>
        ))}
      </div>

      {vendor.markers_covered.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {vendor.markers_covered.map((m) => (
            <span
              key={m}
              className="rounded-full bg-background border border-border/70 px-2 py-0.5 text-[10px] font-body text-foreground/80"
            >
              {m}
            </span>
          ))}
        </div>
      )}

      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="inline-flex items-center gap-1.5 rounded-pill bg-primary px-3 py-2 text-[12px] font-body font-semibold text-primary-foreground"
        >
          View panel
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

      {footer}
    </SurfaceCard>
  );
};

export default VendorRow;
