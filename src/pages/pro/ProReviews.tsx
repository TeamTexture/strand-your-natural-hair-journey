import { useState } from "react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ReviewItem from "@/components/ReviewItem";
import { Button } from "@/components/ui/button";
import { useProReviews, useDecideReview, type ProReview } from "@/hooks/useReviews";

/**
 * Professional review moderation. Pending reviews can be approved (published
 * to the public listing) or denied (kept private to the pro and the client).
 * Decisions are final in the UI — decided_at is preserved for support.
 */
const ProReviews = () => {
  const { data: reviews = [], isLoading } = useProReviews();
  const decide = useDecideReview();
  const [confirming, setConfirming] = useState<{ id: string; status: "approved" | "denied" } | null>(
    null,
  );

  const pending = reviews.filter((r) => r.status === "pending");
  const decided = reviews.filter((r) => r.status !== "pending");

  const run = async (id: string, status: "approved" | "denied") => {
    try {
      await decide.mutateAsync({ id, status });
      toast.success(status === "approved" ? "Review published" : "Review not published");
    } catch (e) {
      toast.error("Could not save that decision");
    } finally {
      setConfirming(null);
    }
  };

  const Row = ({ r, actions }: { r: ProReview; actions?: boolean }) => (
    <SurfaceCard key={r.id}>
      <ReviewItem
        rating={r.rating}
        createdAt={r.created_at}
        bodyText={r.body_text}
        audioPath={r.audio_path}
        transcription={r.transcription_text}
      />
      {actions ? (
        confirming?.id === r.id ? (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-body text-foreground/80 leading-snug">
              {confirming.status === "approved"
                ? "Publish this review on your listing? This can't be undone here."
                : "Decline this review? It stays visible to you and the client only, and can't be undone here."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="pill"
                onClick={() => setConfirming(null)}
                disabled={decide.isPending}
              >
                Cancel
              </Button>
              <Button
                size="pill"
                onClick={() => run(r.id, confirming.status)}
                disabled={decide.isPending}
              >
                {decide.isPending ? "Saving…" : "Confirm"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              onClick={() => setConfirming({ id: r.id, status: "denied" })}
              className="py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary text-foreground rounded-md min-h-[44px]"
            >
              Deny
            </button>
            <button
              type="button"
              onClick={() => setConfirming({ id: r.id, status: "approved" })}
              className="py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium min-h-[44px]"
            >
              Approve
            </button>
          </div>
        )
      ) : (
        <p className="text-[11px] font-body text-muted-foreground mt-3">
          {r.status === "approved" ? "Published" : "Not published"}
          {r.decided_at
            ? ` · ${new Date(r.decided_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
            : ""}
        </p>
      )}
    </SurfaceCard>
  );

  return (
    <ScreenLayout>
      <TitleBar title="Reviews" />
      <div className="px-5 pb-8 space-y-4">
        {isLoading ? (
          <LoadingDot label="Loading reviews…" fullScreen={false} />
        ) : reviews.length === 0 ? (
          <EmptyState
            icon="⭐"
            message="No reviews yet"
            hint="Clients can review you after you log a completed appointment."
          />
        ) : (
          <>
            {pending.length > 0 && (
              <>
                <SectionLabel>Awaiting your decision</SectionLabel>
                <div className="space-y-3">
                  {pending.map((r) => (
                    <Row key={r.id} r={r} actions />
                  ))}
                </div>
              </>
            )}
            {decided.length > 0 && (
              <>
                <SectionLabel>Decided</SectionLabel>
                <div className="space-y-3">
                  {decided.map((r) => (
                    <Row key={r.id} r={r} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default ProReviews;
