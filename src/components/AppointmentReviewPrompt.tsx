import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import StarRating from "@/components/StarRating";
import { useMyReviewsByAppointment } from "@/hooks/useReviews";
import AppointmentOutcomeDialog, {
  type AppointmentOutcome,
  recordAppointmentOutcome,
} from "@/components/AppointmentOutcomeDialog";
import { useAuth } from "@/hooks/useAuth";

/**
 * Retrospective review prompt shown inside a PAST appointment card.
 *
 * Appears for every past appointment linked to a STRAND professional that the
 * member hasn't reviewed yet — including ones still sitting at `upcoming`
 * because nobody ever closed them out, and ones logged long before reviews
 * existed. Once a review is in, the member sees its own status only.
 *
 * Tapping the button opens the SHARED confirm-it-happened step
 * (AppointmentOutcomeDialog) — the same component the Home follow-up nudge
 * uses, writing status through the same helper. "Yes" continues to the review
 * form; "cancelled"/"didn't happen" resolves the appointment instead, and the
 * card stops offering a review.
 */
const AppointmentReviewPrompt = ({
  appointmentId,
  status,
  linkedProUserId,
  professionalName,
  onStatusChange,
}: {
  appointmentId: string;
  status: string;
  linkedProUserId?: string | null;
  professionalName?: string | null;
  onStatusChange?: (status: string) => void;
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: byAppointment } = useMyReviewsByAppointment();
  const [confirming, setConfirming] = useState(false);

  // Reviewable: linked to a real professional, and not already resolved as
  // cancelled/not-attended.
  const reviewable =
    !!linkedProUserId && (status === "completed" || status === "upcoming");
  if (!reviewable) return null;

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

  const who = professionalName || "your professional";

  const handleHappened = async () => {
    setConfirming(false);
    // An unresolved row is confirmed as attended first, so the review form and
    // every completed-only surface agree it went ahead.
    if (status !== "completed") {
      await recordAppointmentOutcome(appointmentId, "happened", user?.id);
      onStatusChange?.("completed");
    }
    navigate(`/reviews/new?appointmentId=${appointmentId}`);
  };

  const handleResolved = (outcome: AppointmentOutcome) => {
    onStatusChange?.(outcome === "cancelled" ? "cancelled" : "no_show");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-3 w-full flex items-center justify-center gap-2 rounded-[12px] border border-primary/40 bg-primary/10 px-3 py-2.5 min-h-[44px] text-[11px] font-body font-semibold uppercase tracking-[0.12em] text-primary"
      >
        <Star className="size-3.5" strokeWidth={2} />
        Leave a review
      </button>
      {confirming && (
        <AppointmentOutcomeDialog
          appointmentId={appointmentId}
          who={who}
          title={`Did you have your appointment with ${who}?`}
          description="We'll only ask for a review if it went ahead."
          happenedLabel="Yes, it happened"
          laterLabel="Not now"
          onHappened={() => void handleHappened()}
          onResolved={handleResolved}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
};

export default AppointmentReviewPrompt;
