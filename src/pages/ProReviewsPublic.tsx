import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import StarRating from "@/components/StarRating";
import ReviewItem from "@/components/ReviewItem";
import {
  usePublicReviews,
  useReviewSummaries,
  REVIEWS_PAGE_SIZE,
  type PublicReview,
} from "@/hooks/useReviews";
import { useDirectoryProfessionals } from "@/hooks/useDirectoryProfessionals";
import { useNavigate } from "react-router-dom";
import { useProContactStates, proContactStatusLine } from "@/hooks/useProContactState";
import ProContactAction from "@/components/directory/ProContactAction";
import { formatDistanceToNow } from "date-fns";

/**
 * Full public reviews list for one professional — approved reviews only,
 * most recent first, lazy-loaded ten at a time.
 */
const ProReviewsPublic = () => {
  const { proUserId } = useParams<{ proUserId: string }>();
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState<PublicReview[]>([]);
  const { pros } = useDirectoryProfessionals();
  const pro = useMemo(() => pros.find((p) => p.proUserId === proUserId), [pros, proUserId]);
  const { data: summaries } = useReviewSummaries(proUserId ? [proUserId] : []);
  const summary = proUserId ? summaries?.get(proUserId) : undefined;
  const { data: pageRows = [], isLoading } = usePublicReviews(proUserId, page);
  const navigate = useNavigate();
  const { stateFor } = useProContactStates();
  const contact = stateFor(proUserId);
  const contactLine = proContactStatusLine(contact, (iso) =>
    formatDistanceToNow(new Date(iso), { addSuffix: true }),
  );

  // Accumulate pages so "Load more" appends rather than replaces.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const all = [...loaded, ...pageRows].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    return all;
  }, [loaded, pageRows]);

  const canLoadMore = pageRows.length === REVIEWS_PAGE_SIZE;

  return (
    <ScreenLayout>
      <TitleBar title="Reviews" />
      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard>
          <p className="font-display text-lg font-semibold leading-tight">
            {pro?.name ?? "Professional"}
          </p>
          {summary ? (
            <div className="flex items-center gap-2 mt-1.5">
              <StarRating value={summary.avg_rating} size="size-4" />
              <span className="font-body text-[13px] font-semibold">
                {summary.avg_rating.toFixed(1)}
              </span>
              <span className="font-body text-[11px] text-muted-foreground">
                ({summary.review_count} {summary.review_count === 1 ? "review" : "reviews"})
              </span>
            </div>
          ) : (
            <p className="text-[11px] font-body text-muted-foreground mt-1">No reviews yet</p>
          )}
          <p className="text-[11px] font-body text-muted-foreground mt-2 leading-snug">
            Every review comes from a client who booked and attended an appointment through STRAND.
          </p>
          {proUserId && (
            <div className="mt-3 space-y-2">
              {contactLine && (
                <p className="text-[11px] font-body text-muted-foreground">{contactLine}</p>
              )}
              <ProContactAction
                state={contact}
                className="w-full"
                onEnquire={() => navigate(`/directory?pro=${proUserId}`)}
              />
            </div>
          )}
        </SurfaceCard>

        {isLoading && rows.length === 0 ? (
          <LoadingDot label="Loading reviews…" fullScreen={false} />
        ) : rows.length === 0 ? (
          <EmptyState icon="⭐" message="No reviews yet" hint="Check back after your visit." />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <SurfaceCard key={r.id}>
                <ReviewItem
                  rating={r.rating}
                  createdAt={r.created_at}
                  reviewerLabel={r.reviewer_label}
                  bodyText={r.body_text}
                  audioPath={r.audio_path}
                  transcription={r.transcription_text}
                  service={r.service}
                />
              </SurfaceCard>
            ))}
            {canLoadMore && (
              <button
                type="button"
                onClick={() => {
                  setLoaded(rows);
                  setPage((p) => p + 1);
                }}
                className="w-full py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary text-foreground rounded-md min-h-[44px]"
              >
                Load more reviews
              </button>
            )}
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default ProReviewsPublic;
