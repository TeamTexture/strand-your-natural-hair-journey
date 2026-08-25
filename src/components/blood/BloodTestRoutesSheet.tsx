import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Droplet, FlaskConical, Stethoscope } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import BrandBloodPanelRow from "@/components/blood/BrandBloodPanelRow";
import { useBloodTestBrandPanels } from "@/hooks/useBloodTestBrands";
import { useDirectoryProfessionals } from "@/hooks/useDirectoryProfessionals";
import { orderPanelsByRelevance } from "@/lib/bloodTestBrands";
import { bloodsSettingLabel } from "@/lib/proCapabilities";

/**
 * THE retest routes sheet, opened from the ALERTS TAB when a blood retest is
 * due. Both routes live in one sheet — at-home kits from the brand directory,
 * and verified blood-capable professionals — because a member deciding how to
 * get tested needs to see both options side by side, not one at a time.
 *
 * Relevance: where the alert names overdue or out-of-range markers, panels and
 * professionals covering those markers sort above generic ones.
 */

const BloodTestRoutesSheet = ({
  open,
  onOpenChange,
  neededMarkers = [],
  reason,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Markers driving the alert, in `blood_results.marker` vocabulary. */
  neededMarkers?: string[];
  reason?: string;
}) => {
  const nav = useNavigate();
  const { panels, loading: panelsLoading } = useBloodTestBrandPanels();
  const { pros, loading: prosLoading } = useDirectoryProfessionals();

  const orderedPanels = useMemo(
    () =>
      orderPanelsByRelevance(
        // Curated third-party vendors must be ticked as at-home kit providers.
        panels.filter((p) => (p.brand_user_id ? true : p.is_at_home_kit === true)),
        neededMarkers,
      ),
    [panels, neededMarkers],
  );

  // Verified bloods badge only — a claim never reaches this list.
  const bloodPros = useMemo(
    () => pros.filter((p) => p.canTakeBloodsVerified),
    [pros],
  );

  const loading = panelsLoading || prosLoading;
  const hasBrands = orderedPanels.length > 0;
  const hasPros = bloodPros.length > 0;

  const markerLine =
    neededMarkers.length > 0
      ? `Look for a panel that covers ${neededMarkers.slice(0, 3).join(", ")}.`
      : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl px-5 pb-8">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-[20px]">Getting your bloods retested</SheetTitle>
          <SheetDescription className="font-body text-[12.5px] leading-relaxed">
            {reason ?? "Two ways to get this done."} {markerLine}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-10">
            <LoadingDot />
          </div>
        ) : !hasBrands && !hasPros ? (
          /* Neither route available — plain, non-alarming, no medical advice. */
          <SurfaceCard className="mt-4 space-y-2">
            <p className="font-display text-[15px] leading-tight">Nothing to book through STRAND yet</p>
            <p className="text-[12.5px] font-body text-foreground/80 leading-relaxed">
              We can't arrange a blood test for you at the moment. Your GP is the
              simplest place to start — they can advise which tests are right for you
              and arrange them.
            </p>
          </SurfaceCard>
        ) : (
          <div className="mt-4 space-y-5">
            {/* ROUTE A — at-home kits from the brand directory. */}
            {hasBrands && (
              <section className="space-y-2">
                <SectionLabel className="!px-0 !mt-0">
                  <span className="inline-flex items-center gap-1.5">
                    <FlaskConical className="size-3.5" aria-hidden="true" /> At-home kits
                  </span>
                </SectionLabel>
                <p className="text-[11.5px] font-body text-muted-foreground leading-snug">
                  A kit is posted to you, you take the sample at home and post it back.
                </p>
                {orderedPanels.map((p) => (
                  <BrandBloodPanelRow key={p.id} panel={p} neededMarkers={neededMarkers} />
                ))}
              </section>
            )}

            {/* ROUTE B — verified blood-capable professionals. */}
            {hasPros && (
              <section className="space-y-2">
                <SectionLabel className="!px-0 !mt-0">
                  <span className="inline-flex items-center gap-1.5">
                    <Stethoscope className="size-3.5" aria-hidden="true" /> Book a professional
                  </span>
                </SectionLabel>
                <p className="text-[11.5px] font-body text-muted-foreground leading-snug">
                  These professionals can take your bloods in person.
                </p>
                {bloodPros.map((p) => (
                  <SurfaceCard key={p.id} className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[15px] font-semibold leading-tight truncate">
                          {p.name}
                        </p>
                        <p className="text-[11.5px] font-body text-foreground/75 leading-snug">
                          {p.title}
                          {p.location ? ` · ${p.location}` : ""}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-body shrink-0">
                        <Droplet className="size-3" aria-hidden="true" />
                        {bloodsSettingLabel(p.bloodsSetting) || "Bloods"}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-pill text-[12px]"
                      onClick={() => {
                        onOpenChange(false);
                        nav(p.proUserId ? `/directory?pro=${p.proUserId}` : "/directory");
                      }}
                    >
                      View profile and enquire
                    </Button>
                  </SurfaceCard>
                ))}
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default BloodTestRoutesSheet;
