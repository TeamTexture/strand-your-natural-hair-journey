import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useProCheckinReview, useSendCheckinComment } from "@/hooks/useProTreatment";
import { CHECKIN_METRICS, ratingLabel } from "@/lib/treatmentCheckin";
import { signedMediaUrls } from "@/lib/treatmentMedia";

/**
 * Review a client's weekly check-in.
 *
 * When media sharing is off there is one quiet line and nothing else — there is
 * deliberately no way from this screen to ask, nudge or prompt for consent.
 */
const ProTreatmentCheckin = () => {
  const { planId, week } = useParams();
  const nav = useNavigate();
  const weekNo = Number(week ?? 1);
  const review = useProCheckinReview(planId, weekNo);
  const send = useSendCheckinComment();
  const [body, setBody] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});

  const media = review.media;
  const paths = useMemo(() => media.map((m) => m.storage_path as string), [media]);

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

  const ratings = (review.checkin?.ratings ?? {}) as Record<string, number>;
  const firstName = review.clientName.split(/\s+/)[0];

  const onSend = () => {
    if (!review.checkin?.id || !review.clientUserId) return;
    send.mutate(
      { checkinId: review.checkin.id, clientUserId: review.clientUserId, body },
      {
        onSuccess: (threadId) => {
          setBody("");
          toast.success("Sent to your conversation");
          nav(`/messages/${threadId}`);
        },
        onError: () => toast.error("Couldn't send that just now"),
      },
    );
  };

  return (
    <ScreenLayout>
      <TitleBar title={`Week ${weekNo} check-in`} backFallback="/pro/treatment" />

      <div className="px-5 pt-1 pb-10 space-y-4">
        <div>
          <h1 className="font-display text-[22px] leading-tight [overflow-wrap:anywhere]">
            {review.clientName}
          </h1>
          <p className="font-body text-[13px] text-muted-foreground mt-0.5 [overflow-wrap:anywhere]">
            {review.planTitle}
          </p>
        </div>

        {review.loading ? (
          <LoadingDot />
        ) : !review.checkin?.submitted_at ? (
          <EmptyState icon="🌱" message={`${firstName} hasn't saved this week's check-in yet.`} />
        ) : (
          <>
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

            {review.checkin.note && (
              <SurfaceCard>
                <SectionLabel className="px-0 mt-0 mb-1.5">In their words</SectionLabel>
                <p className="font-body text-[14px] leading-snug [overflow-wrap:anywhere]">
                  {review.checkin.note}
                </p>
              </SurfaceCard>
            )}

            <div className="space-y-2">
              <SectionLabel className="px-0 mt-0 mb-1.5">Photos and recordings</SectionLabel>
              {!review.mediaShared ? (
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
                          alt={`Week ${weekNo} photo`}
                          loading="lazy"
                          className="aspect-square w-full rounded-xl object-cover bg-muted"
                        />
                      ))}
                  </div>
                  {media
                    .filter((m) => m.media_type === "audio")
                    .map((m) => (
                      <audio key={m.id} controls src={urls[m.storage_path] ?? ""} className="w-full" />
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

            <div className="space-y-2">
              <SectionLabel className="px-0 mt-0 mb-1.5">Reply</SectionLabel>
              <SurfaceCard className="space-y-2">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  maxLength={800}
                  placeholder={`Write to ${firstName}…`}
                />
                <p className="font-body text-[12px] text-muted-foreground leading-snug">
                  This goes into your conversation with {firstName} in Messages, and is saved
                  alongside this check-in.
                </p>
                <Button
                  className="rounded-pill w-full"
                  disabled={!body.trim() || !review.clientUserId || send.isPending}
                  onClick={onSend}
                >
                  Send
                </Button>
              </SurfaceCard>

              {review.comments.length > 0 && (
                <div className="space-y-1.5">
                  {review.comments.map((c) => (
                    <SurfaceCard key={c.id}>
                      <p className="font-body text-[13px] leading-snug [overflow-wrap:anywhere]">
                        {c.body}
                      </p>
                    </SurfaceCard>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default ProTreatmentCheckin;
