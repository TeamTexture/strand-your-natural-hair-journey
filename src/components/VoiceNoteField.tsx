import { useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, Trash2, Loader2, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Generic text + voice-note field.
 *
 * Renders a textarea, a record button, and (when a recording exists)
 * a playback bar plus two actions: "Keep as voice note only" and
 * "Transcribe to text". The transcript is appended to the text value.
 *
 * The audio file is uploaded to the `voicenotes` storage bucket and the
 * returned storage path is communicated via `onAudioPathChange`. Both
 * the text and the audio path can co-exist — callers persist them
 * together against their own table.
 */
interface Props {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (next: string) => void;
  /** Storage path of the most recent recording (null when none). */
  audioPath?: string | null;
  onAudioPathChange?: (path: string | null) => void;
  /** Folder under the user's id in the bucket — keeps audio organised. */
  folder: string;
  rows?: number;
  required?: boolean;
  errorMessage?: string;
}

const fmt = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const result = r.result as string;
      // strip data:...;base64,
      resolve(result.split(",")[1] ?? "");
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

const VoiceNoteField = ({
  label,
  placeholder,
  value,
  onChange,
  audioPath,
  onAudioPathChange,
  folder,
  rows = 4,
  required = false,
  errorMessage,
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

  // Sign URL whenever the audio path changes
  useEffect(() => {
    if (!audioPath) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from("voicenotes")
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
        setRecDur((Date.now() - startRef.current) / 1000);
      }, 250);
    } catch (e) {
      console.error("Mic permission denied:", e);
      toast.error("Microphone access denied");
    }
  };

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
    if (dur < 0.5) {
      toast("Recording too short");
      return;
    }
    setUploading(true);
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const path = `${user.id}/${folder}/${crypto.randomUUID()}.webm`;
      const { error } = await supabase.storage
        .from("voicenotes")
        .upload(path, blob, { contentType: "audio/webm", upsert: false });
      if (error) throw error;
      onAudioPathChange?.(path);
      toast.success("Voice note saved");
    } catch (e) {
      console.error("Upload failed:", e);
      toast.error("Could not save voice note");
    } finally {
      setUploading(false);
      setRecDur(0);
    }
  };

  const playPause = () => {
    if (!signedUrl) return;
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    const a = new Audio(signedUrl);
    a.onended = () => setPlaying(false);
    a.onerror = () => {
      toast.error("Could not play");
      setPlaying(false);
    };
    a.play();
    audioRef.current = a;
    setPlaying(true);
  };

  const removeNote = async () => {
    if (!audioPath) return;
    audioRef.current?.pause();
    setPlaying(false);
    const path = audioPath;
    onAudioPathChange?.(null);
    await supabase.storage.from("voicenotes").remove([path]);
  };

  const transcribe = async () => {
    if (!signedUrl) return;
    setTranscribing(true);
    try {
      // Re-fetch the file as a Blob to base64-encode it for the gateway.
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
        toast("No speech detected");
        return;
      }
      const next = value.trim() ? `${value.trim()}\n\n${text}` : text;
      onChange(next);
      toast.success("Transcribed to text");
    } catch (e) {
      console.error("transcribe failed", e);
      toast.error("Could not transcribe");
    } finally {
      setTranscribing(false);
    }
  };

  const showError = required && !value.trim() && !audioPath && !!errorMessage;

  return (
    <div className="space-y-2">
      <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
        {label}
        {required && <span className="text-warn ml-1">*</span>}
      </span>

      <div className="flex gap-2 items-start">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={cn(
            "flex-1 px-3.5 py-3 bg-card rounded-[10px] border text-sm focus:outline-none transition-colors resize-none",
            showError ? "border-warn" : "border-border focus:border-primary/60",
          )}
        />
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={uploading}
          aria-label={recording ? "Stop recording" : "Record voice note"}
          className={cn(
            "shrink-0 size-11 rounded-full flex items-center justify-center transition-colors border",
            recording
              ? "bg-warn text-white border-warn"
              : "bg-card border-border text-foreground hover:border-primary/60",
          )}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : recording ? (
            <Square className="size-4 fill-current" />
          ) : (
            <Mic className="size-4" />
          )}
        </button>
      </div>

      {recording && (
        <div className="flex items-center gap-2 text-[11px] text-warn font-body">
          <span className="size-2 rounded-full bg-warn animate-pulse" />
          Recording · {fmt(recDur)}
        </div>
      )}

      {audioPath && signedUrl && !recording && (
        <div className="space-y-2 p-3 bg-card border border-border rounded-[10px]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={playPause}
              className="size-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
            </button>
            <p className="text-xs flex-1 font-body">Voice note saved</p>
            <button
              type="button"
              onClick={removeNote}
              className="size-9 rounded-full text-muted-foreground hover:text-warn flex items-center justify-center shrink-0"
              aria-label="Delete voice note"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toast("Saved as voice note only")}
              className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground border border-border rounded-full px-3 py-1.5 hover:border-primary/60"
            >
              Keep as voice note only
            </button>
            <button
              type="button"
              onClick={transcribe}
              disabled={transcribing}
              className="text-[11px] uppercase tracking-[0.15em] text-primary border border-primary/40 bg-primary/5 rounded-full px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {transcribing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Type className="size-3" />
              )}
              {transcribing ? "Transcribing…" : "Transcribe to text"}
            </button>
          </div>
        </div>
      )}

      {showError && (
        <p className="text-[11px] text-warn font-body">{errorMessage}</p>
      )}
    </div>
  );
};

export default VoiceNoteField;
