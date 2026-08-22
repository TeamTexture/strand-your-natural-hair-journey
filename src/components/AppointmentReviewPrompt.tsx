import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import StarRating from "@/components/StarRating";
import { useMyReviewsByAppointment } from "@/hooks/useReviews";

/**
 * Retrospective review prompt shown inside a PAST appointment card.
 *
 * Appears for every completed appointment linked to a STRAND professional that
 * the member hasn't reviewed yet — including ones logged long before reviews
 * existed. Once a review is in, the member sees its own status only.
 */
const AppointmentReviewPrompt = ({
  appointmentId,
  status,
  linkedProUserId,
}: {
  appointmentId: string;
  status: string;
  linkedProUserId?: string | null;
}) => {
  const navigate = useNavigate();
  const { data: byAppointment } = useMyReviewsByAppointment();
  if (status !== "completed" || !linkedProUserId) return null;

  const mine = byAppointment?.get(appointmentId);

  if (mine) {
    const line =
      mine.status === "approved"
        ? "Published on their listing"
        : mine.status === "denied"
          ? "Not published"
          : "Sent — waiting for their approval";
    return (
      <div className="mt-3 rounded-[12px] border border-border bg-background/60 p-3">
        <div className="flex items-center gap-2">
          <StarRating value={mine.rating} />
          <span className="text-[11px] font-body text-muted-foreground">{line}</span>
        </div>
        {mine.status === "pending" && (
          <button
            type="button"
            onClick={() => navigate(`/reviews/new?appointmentId=${appointmentId}`)}
            className="mt-2 text-[11px] font-body text-primary min-h-[36px]"
          >
            Edit your review →
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate(`/reviews/new?appointmentId=${appointmentId}`)}
      className="mt-3 w-full flex items-center justify-center gap-2 rounded-[12px] border border-primary/40 bg-primary/10 px-3 py-2.5 min-h-[44px] text-[11px] font-body font-semibold uppercase tracking-[0.12em] text-primary"
    >
      <Star className="size-3.5" strokeWidth={2} />
      Leave a review
    </button>
  );
};

export default AppointmentReviewPrompt;
