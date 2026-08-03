import { useEffect, useState } from "react";
import { Play, Pause, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signGoalAudio, type GoalProgressUpdate } from "@/hooks/useGoalProgressUpdates";

const PHOTO_BUCKET = "journal-photos";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/** One progress update: text, voicenote playback + transcription, photo. */
const GoalUpdateRow = ({ update }: { update: GoalProgressUpdate }) => {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (update.audio_path) {
        const url = await signGoalAudio(update.audio_path);
        if (!cancelled) setAudioUrl(url);
      }
      if (update.photo_entry_ref) {
        const { data } = await supabase.storage
          .from(PHOTO_BUCKET)
          .createSignedUrl(update.photo_entry_ref, 3600);
        if (!cancelled) setPhotoUrl(data?.signedUrl ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [update.audio_path, update.photo_entry_ref]);

  useEffect(() => () => audio?.pause(), [audio]);

  const playPause = () => {
    if (!audioUrl) return;
    if (playing && audio) {
      audio.pause();
      setPlaying(false);
      return;
    }
    const a = new Audio(audioUrl);
    a.onended = () => setPlaying(false);
    a.play();
    setAudio(a);
    setPlaying(true);
  };

  return (
    <li className="relative pl-5">
      <span className="absolute left-0 top-2 size-2 rounded-full bg-primary" aria-hidden />
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body">
        {fmtDate(update.created_at)}
      </p>
      {update.body_text && (
        <p className="text-[13px] font-body leading-relaxed whitespace-pre-line mt-0.5">
          {update.body_text}
        </p>
      )}
      {update.audio_path && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={playPause}
            aria-label={playing ? "Pause voicenote" : "Play voicenote"}
            className="size-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0"
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
          </button>
          <span className="text-[11px] font-body text-muted-foreground inline-flex items-center gap-1">
            <Mic className="size-3" /> Voicenote
          </span>
        </div>
      )}
      {update.transcription_text && (
        <p className="text-[12px] font-body leading-relaxed text-muted-foreground mt-1.5 whitespace-pre-line">
          {update.transcription_text}
        </p>
      )}
      {photoUrl && (
        <img
          src={photoUrl}
          alt="Progress photo"
          loading="lazy"
          className="mt-2 h-32 w-full object-cover rounded-[10px]"
        />
      )}
    </li>
  );
};

export default GoalUpdateRow;
