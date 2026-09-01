import { useEffect, useMemo, useState } from "react";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { CHECKIN_METRICS, ratingLabel } from "@/lib/treatmentCheckin";
import { signedMediaUrls } from "@/lib/treatmentMedia";

export interface CheckinMediaRow {
  id: string;
  media_type: "photo" | "audio" | "video";
  storage_path: string;
  caption?: string | null;
}

export interface CheckinReviewProps {
  weekNumber: number;
  ratings: Record<string, number>;
  note?: string | null;
  media: CheckinMediaRow[];
  /** True only where has_media_access passes for this plan. */
  mediaShared: boolean;
  /** First name, for the quiet no-media line. */
  firstName: string;
}

/**
 * One rendering of a client's weekly check-in, shared by the professional
 * check-in review screen and the treatment section of the client passport.
 *
 * When media sharing is off there is one quiet line and nothing else — no
 * request button and no nudge mechanism anywhere in here.
 */
const CheckinReview = ({
  weekNumber,
  ratings,
  note,
  media,
  mediaShared,
  firstName,
}: CheckinReviewProps) => {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const paths = useMemo(() => media.map((m) => m.storage_path), [media]);

  useEffect(() => {
    if (!paths.length) return;
    let cancelled = false;
    void signedMediaUrls(paths).then((map) => {
      if (!cancelled) setUrls(map);
    });
    return () => {
      cancelled = true;
    };
  }, [paths]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <SectionLabel className="px-0 mt-0 mb-1.5">How the week went</SectionLabel>
        {CHECKIN_METRICS.map((m) => (
          <SurfaceCard key={m.key} padded={false} className="px-4 py-3 flex items-center gap-3">
            <p className="font-body text-[13px] flex-1 min-w-0">{m.label}</p>
            <p className="font-body text-[13px] font-semibold shrink-0">
              {ratings[m.key] ? ratingLabel(m, ratings[m.key]) : "Not answered"}
            </p>
          </SurfaceCard>
        ))}
      </div>

      {note && (
        <SurfaceCard>
          <SectionLabel className="px-0 mt-0 mb-1.5">In their words</SectionLabel>
          <p className="font-body text-[14px] leading-snug [overflow-wrap:anywhere]">{note}</p>
        </SurfaceCard>
      )}

      <div className="space-y-2">
        <SectionLabel className="px-0 mt-0 mb-1.5">Photos and recordings</SectionLabel>
        {!mediaShared ? (
          <p className="font-body text-[13px] text-muted-foreground">
            {firstName} hasn't shared photos or voice notes.
          </p>
        ) : media.length === 0 ? (
          <p className="font-body text-[13px] text-muted-foreground">
            Nothing recorded for this week.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              {media
                .filter((m) => m.media_type === "photo")
                .map((m) => (
                  <img
                    key={m.id}
                    src={urls[m.storage_path] ?? ""}
                    alt={`Week ${weekNumber} photo`}
                    loading="lazy"
                    className="aspect-square w-full rounded-xl object-cover bg-muted"
                  />
                ))}
            </div>
            {media
              .filter((m) => m.media_type === "audio")
              .map((m) => (
                <VoicePlayer
                  key={m.id}
                  url={urls[m.storage_path] ?? null}
                  variant="onSurface"
                  className="text-foreground"
                />

              ))}
            {media
              .filter((m) => m.media_type === "video")
              .map((m) => (
                <video
                  key={m.id}
                  controls
                  src={urls[m.storage_path] ?? ""}
                  className="w-full rounded-xl bg-muted"
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckinReview;
