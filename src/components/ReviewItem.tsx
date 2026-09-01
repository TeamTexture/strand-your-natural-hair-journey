import { useState } from "react";
import { Play, Pause, FileText, ShieldCheck } from "lucide-react";
import StarRating from "@/components/StarRating";
import VoicePlayer from "@/components/voice/VoicePlayer";

import { signReviewAudio } from "@/hooks/useReviews";
import { cn } from "@/lib/utils";

/**
 * One review, used on the public profile, the full reviews list and the pro's
 * moderation queue. Voicenotes are streamed from the private bucket via a
 * short-lived signed URL, with the transcription available on a toggle.
 */
const ReviewItem = ({
  rating,
  createdAt,
  reviewerLabel,
  bodyText,
  audioPath,
  transcription,
  service,
  clamp = false,
  className,
}: {
  rating: number;
  createdAt: string;
  reviewerLabel?: string | null;
  bodyText?: string | null;
  audioPath?: string | null;
  transcription?: string | null;
  service?: string | null;
  clamp?: boolean;
  className?: string;
}) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const dateLabel = new Date(createdAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const loadAudio = async () => {
    if (audioUrl || !audioPath) return;
    setLoadingAudio(true);
    const url = await signReviewAudio(audioPath);
    setAudioUrl(url);
    setLoadingAudio(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <StarRating value={rating} />
        <span className="text-[11px] font-body text-muted-foreground">{dateLabel}</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {reviewerLabel && (
          <span className="text-[12px] font-body font-medium text-foreground">{reviewerLabel}</span>
        )}
        <span className="inline-flex items-center gap-1 bg-good/15 text-good text-[10px] font-medium px-1.5 py-0.5 rounded">
          <ShieldCheck className="size-3" /> Booked client
        </span>
        {service && (
          <span className="bg-primary/10 text-foreground text-[10px] px-1.5 py-0.5 rounded">
            {service}
          </span>
        )}
      </div>

      {bodyText && bodyText.trim().length > 0 && (
        <p
          className={cn(
            "text-[12px] font-body text-foreground/85 leading-relaxed",
            clamp && "line-clamp-2",
          )}
        >
          {bodyText}
        </p>
      )}

      {audioPath && (
        <div className="space-y-2">
          {audioUrl ? (
            <VoicePlayer url={audioUrl} variant="onSurface" className="text-foreground" />
          ) : (
            <button
              type="button"
              onClick={loadAudio}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary border border-border px-3 py-1.5 text-[11px] font-body min-h-[36px]"
            >
              {loadingAudio ? <Pause className="size-3.5" /> : <Play className="size-3.5 text-primary" />}
              {loadingAudio ? "Loading…" : "Play voicenote"}
            </button>
          )}
          {transcription && transcription.trim().length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowTranscript((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[11px] font-body text-primary min-h-[36px]"
              >
                <FileText className="size-3.5" />
                {showTranscript ? "Hide transcription" : "Read transcription"}
              </button>
              {showTranscript && (
                <p className="text-[12px] font-body text-foreground/80 leading-relaxed mt-1">
                  {transcription}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReviewItem;
