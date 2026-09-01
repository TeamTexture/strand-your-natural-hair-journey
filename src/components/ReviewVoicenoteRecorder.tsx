import { useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, Trash2, Loader2, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uuid } from "@/lib/uuid";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Review voicenote recorder.
 *
 * Records in the browser (MediaRecorder), caps the clip at two minutes,
 * uploads to the private `review-audio` bucket, offers playback and
 * re-record, and can transcribe the clip so the reviewer can confirm or
 * edit the words before submitting.
 */
export const REVIEW_AUDIO_MAX_SECONDS = 120;

interface Props {
  /** Storage path of the uploaded clip, or null when none. */
  audioPath: string | null;
  onAudioPathChange: (path: string | null) => void;
  /** Transcription text; empty string when not transcribed. */
  transcription: string;
  onTranscriptionChange: (next: string) => void;
  /** Private bucket the clip is uploaded to. */
  bucket?: string;
  /** Folder inside the user's prefix. */
  folder?: string;
}

const fmt = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(((r.result as string) || "").split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

const ReviewVoicenoteRecorder = ({
  audioPath,
  onAudioPathChange,
  transcription,
  onTranscriptionChange,
  bucket = "review-audio",
  folder = "reviews",
}: Props) => {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recDur, setRecDur] = useState(0);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioPath) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(audioPath, 3600);
      if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [audioPath]);

  useEffect(
    () => () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    },
    [],
  );

  const stopRecording = () => {
    if (!mrRef.current || mrRef.current.state === "inactive") return;
    mrRef.current.stop();
    if (tickRef.current) window.clearInterval(tickRef.current);
    setRecording(false);
  };

  const handleStop = async () => {
    if (!user) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const dur = (Date.now() - startRef.current) / 1000;
    if (dur < 1) {
      toast("That was too short — try again");
      setRecDur(0);
      return;
    }
    setUploading(true);
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const path = `${user.id}/${folder}/${uuid()}.webm`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, blob, { contentType: "audio/webm", upsert: false });
      if (error) throw error;
      onAudioPathChange(path);
    } catch (e) {
      console.error("Review audio upload failed:", e);
      toast.error("Could not save your voicenote");
    } finally {
      setUploading(false);
      setRecDur(0);
    }
  };

  const startRecording = async () => {
    if (!user) {
      toast.error("Please sign in to record");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = handleStop;
      mr.start();
      mrRef.current = mr;
      startRef.current = Date.now();
      setRecDur(0);
      setRecording(true);
      tickRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startRef.current) / 1000;
        setRecDur(elapsed);
        // Two-minute cap — stop for them rather than losing the clip.
        if (elapsed >= REVIEW_AUDIO_MAX_SECONDS) {
          toast("Two minutes reached — that's plenty");
          stopRecording();
        }
      }, 250);
    } catch (e) {
      console.error("Mic permission denied:", e);
      toast.error("Microphone access denied");
    }
  };




  const reRecord = async () => {
    if (!audioPath) return;
    audioRef.current?.pause();
    setPlaying(false);
    const path = audioPath;
    onAudioPathChange(null);
    onTranscriptionChange("");
    await supabase.storage.from(bucket).remove([path]);
  };

  const transcribe = async () => {
    if (!signedUrl) return;
    setTranscribing(true);
    try {
      const resp = await fetch(signedUrl);
      const blob = await resp.blob();
      const audioBase64 = await blobToBase64(blob);
      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: { audioBase64, mimeType: blob.type || "audio/webm" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const text = (data?.text ?? "").toString().trim();
      if (!text) {
        toast("No speech detected in that recording");
        return;
      }
      onTranscriptionChange(text);
      toast.success("Transcribed — check the words below");
    } catch (e) {
      console.error("Review transcription failed:", e);
      toast.error("Could not transcribe that — you can still send the voicenote");
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className="space-y-3">
      {!audioPath && (
        <div className="rounded-[14px] border border-border bg-card p-4 text-center space-y-3">
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={uploading}
            aria-label={recording ? "Stop recording" : "Start recording"}
            className={cn(
              "mx-auto size-16 rounded-full flex items-center justify-center border transition-colors",
              recording
                ? "bg-warn text-white border-warn"
                : "bg-primary text-primary-foreground border-primary",
            )}
          >
            {uploading ? (
              <Loader2 className="size-6 animate-spin" />
            ) : recording ? (
              <Square className="size-6 fill-current" />
            ) : (
              <Mic className="size-6" />
            )}
          </button>
          {recording ? (
            <p className="text-[12px] font-body text-warn inline-flex items-center gap-2 justify-center">
              <span className="size-2 rounded-full bg-warn animate-pulse" />
              Recording · {fmt(recDur)} / 2:00
            </p>
          ) : (
            <p className="text-[12px] font-body text-muted-foreground">
              {uploading ? "Saving your voicenote…" : "Tap to record — up to two minutes."}
            </p>
          )}
        </div>
      )}

      {audioPath && (
        <div className="rounded-[14px] border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <VoicePlayer
              url={signedUrl}
              variant="onSurface"
              className="flex-1 min-w-0 text-foreground"
            />
            <button
              type="button"
              onClick={reRecord}
              aria-label="Delete and record again"
              className="size-11 rounded-full text-muted-foreground hover:text-warn flex items-center justify-center shrink-0"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <p className="text-[13px] font-body text-foreground">Your voicenote is ready</p>


          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reRecord}
              className="min-h-[44px] px-4 text-[11px] uppercase tracking-[0.15em] font-body border border-border bg-background rounded-full hover:border-primary/60"
            >
              Record again
            </button>
            <button
              type="button"
              onClick={transcribe}
              disabled={transcribing}
              className="min-h-[44px] px-4 text-[11px] uppercase tracking-[0.15em] font-body text-primary border border-primary/40 bg-primary/5 rounded-full inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {transcribing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Type className="size-3.5" />
              )}
              {transcribing ? "Transcribing…" : transcription ? "Transcribe again" : "Transcribe it"}
            </button>
          </div>

          {transcription && (
            <div className="space-y-2">
              <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
                Transcription — edit anything that came out wrong
              </span>
              <textarea
                value={transcription}
                onChange={(e) => onTranscriptionChange(e.target.value)}
                rows={5}
                className="w-full px-3.5 py-3 bg-background rounded-[10px] border border-border text-sm font-body focus:outline-none focus:border-primary/60 resize-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReviewVoicenoteRecorder;
