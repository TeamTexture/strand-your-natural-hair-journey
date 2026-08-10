import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import { Tag } from "lucide-react";
import { useMyBrandTags, TAGGABLE_LABELS } from "@/hooks/useBrandTags";

const pretty = (d: string | null) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

/** Read-only list of where this brand has been tagged. Tag rows only — never the tagged record. */
const BrandTagsReceived = () => {
  const { tags, loading } = useMyBrandTags();

  return (
    <ScreenLayout>
      <TitleBar title="Where you're tagged" backFallback="/brand" />

      <div className="px-5 pt-1 pb-10 space-y-3">
        <SurfaceCard>
          <p className="font-body text-[13px] text-muted-foreground leading-snug">
            These are the places your brand has been credited or promoted. We only ever show you the
            tag itself — never the member, the content, or anything inside it.
          </p>
        </SurfaceCard>

        {loading ? (
          <LoadingDot />
        ) : tags.length === 0 ? (
          <SurfaceCard className="flex items-start gap-2.5">
            <Tag className="size-4 mt-0.5 text-muted-foreground shrink-0" />
            <p className="font-body text-[13px] text-muted-foreground leading-snug">
              You haven't been tagged anywhere yet.
            </p>
          </SurfaceCard>
        ) : (
          tags.map((t) => {
            const from = pretty(t.promotion_starts_on);
            const to = pretty(t.promotion_ends_on);

            return (
              <SurfaceCard key={t.id} className="space-y-1">
                <p className="font-display text-[15px] leading-tight">
                  Tagged on {TAGGABLE_LABELS[t.taggable_type]}
                </p>
                <p className="font-body text-[12px] text-foreground/70">
                  {t.tag_type === "promoted" ? "Paid placement" : "Editorial mention"}
                </p>
                {t.tag_type === "promoted" && t.disclosure_label && (
                  <p className="font-body text-[13px] leading-snug [overflow-wrap:anywhere]">
                    “{t.disclosure_label}”
                  </p>
                )}
                {(from || to) && (
                  <p className="font-body text-[12px] text-muted-foreground">
                    {from ?? "Open start"} — {to ?? "no end date"}
                  </p>
                )}
              </SurfaceCard>
            );
          })
        )}
      </div>
    </ScreenLayout>
  );
};

export default BrandTagsReceived;
