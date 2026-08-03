import { useNavigate } from "react-router-dom";
import ReviewItem from "@/components/ReviewItem";
import { usePublicReviews } from "@/hooks/useReviews";

/**
 * Most recent approved review shown on a directory listing, with a link into
 * the full reviews list. Renders nothing until there is something to show.
 */
const DirectoryReviewPreview = ({ proUserId }: { proUserId: string }) => {
  const navigate = useNavigate();
  const { data: rows = [] } = usePublicReviews(proUserId, 0, 1);
  const review = rows[0];
  if (!review) return null;

  return (
    <div className="mt-3 rounded-[10px] border border-border/70 bg-background/60 p-3">
      <ReviewItem
        rating={review.rating}
        createdAt={review.created_at}
        reviewerLabel={review.reviewer_label}
        bodyText={review.body_text}
        audioPath={review.audio_path}
        transcription={review.transcription_text}
        service={review.service}
        clamp
      />
      <button
        type="button"
        onClick={() => navigate(`/directory/${proUserId}/reviews`)}
        className="mt-2 text-[11px] font-body text-primary min-h-[36px]"
      >
        See all reviews →
      </button>
    </div>
  );
};

export default DirectoryReviewPreview;
