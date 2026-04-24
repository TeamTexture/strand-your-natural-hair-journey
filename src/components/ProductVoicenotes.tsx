import { useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Voicenote {
  id: string;
  audio_url: string; // storage path
  duration_sec: number | null;
  created_at: string;
  signedUrl?: string;
}

interface Props {
  productKey: string;
  productName?: string;
  productBrand?: string;
}

const formatDuration = (sec: number | null | undefined): string => {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const ProductVoicenotes = ({ productKey, productName, productBrand }: Props) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Voicenote[]>([]);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recDuration, setRecDuration] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recStartRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load voicenotes for this product
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("product_voicenotes")
        .select("id, audio_url, duration_sec, created_at")
        .eq("user_id", user.id)
        .eq("product_key", productKey)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("Voicenotes load failed:", error);
        toast.error("Could not load voicenotes");
      } else {
        // Generate signed URLs for playback
        const withUrls = await Promise.all(
          (data ?? []).map(async (n) => {
            const { data: sig } = await supabase.storage
              .from("voicenotes")
              .createSignedUrl(n.audio_url, 3600);
            return { ...n, signedUrl: sig?.signedUrl } as Voicenote;
          }),
        );
        if (!cancelled) setNotes(withUrls);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, productKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    };
  }, []);

  const startRecording = async () => {
    if (!user) {
      toast.error("Please sign in to record voicenotes");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Use webm/opus where supported (broadest browser coverage)
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = handleStopAndUpload;
      mr.start();
      mediaRecorderRef.current = mr;
      recStartRef.current = Date.now();
      setRecDuration(0);
      setRecording(true);
      tickRef.current = window.setInterval(() => {
        setRecDuration((Date.now() - recStartRef.current) / 1000);
      }, 250);
    } catch (e) {
      console.error("Mic permission denied:", e);
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
    mediaRecorderRef.current.stop();
    if (tickRef.current) window.clearInterval(tickRef.current);
    setRecording(false);
  };

  const handleStopAndUpload = async () => {
    if (!user) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const duration = (Date.now() - recStartRef.current) / 1000;
    if (duration < 0.5) {
      toast("Recording too short");
      return;
    }

    setUploading(true);
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const filename = `${user.id}/${productKey}/${crypto.randomUUID()}.webm`;
      const { error: upErr } = await supabase.storage
        .from("voicenotes")
        .upload(filename, blob, { contentType: "audio/webm" });
      if (upErr) throw upErr;

      const { data: row, error: insErr } = await supabase
        .from("product_voicenotes")
        .insert({
          user_id: user.id,
          product_key: productKey,
          product_name: productName,
          product_brand: productBrand,
          audio_url: filename,
          duration_sec: duration,
        })
        .select("id, audio_url, duration_sec, created_at")
        .single();
      if (insErr) throw insErr;

      const { data: sig } = await supabase.storage
        .from("voicenotes")
        .createSignedUrl(filename, 3600);

      setNotes((prev) => [{ ...row, signedUrl: sig?.signedUrl } as Voicenote, ...prev]);
      toast.success("Voicenote saved");
    } catch (e) {
      console.error("Upload failed:", e);
      toast.error("Could not save voicenote");
    } finally {
      setUploading(false);
      setRecDuration(0);
    }
  };

  const playPause = (note: Voicenote) => {
    if (!note.signedUrl) return;
    if (playingId === note.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(note.signedUrl);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      toast.error("Could not play voicenote");
      setPlayingId(null);
    };
    audio.play();
    audioRef.current = audio;
    setPlayingId(note.id);
  };

  const deleteNote = async (note: Voicenote) => {
    if (!user) return;
    if (playingId === note.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    }
    const prev = notes;
    setNotes((p) => p.filter((n) => n.id !== note.id));
    const { error } = await supabase.from("product_voicenotes").delete().eq("id", note.id);
    if (error) {
      console.error("Delete failed:", error);
      toast.error("Could not delete");
      setNotes(prev);
      return;
    }
    await supabase.storage.from("voicenotes").remove([note.audio_url]);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
          Voicenotes
        </span>
        {notes.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {notes.length} note{notes.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Recorder control */}
      <button
        type="button"
        onClick={recording ? stopRecording : startRecording}
        disabled={uploading}
        className={cn(
          "w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-[10px] border min-h-[48px] font-body text-sm transition-colors",
          recording
            ? "bg-warn/10 border-warn text-warn"
            : "bg-card border-border text-foreground hover:border-primary/50",
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Saving…
          </>
        ) : recording ? (
          <>
            <Square className="size-4 fill-current" />
            Stop · {formatDuration(recDuration)}
            <span className="ml-1 size-2 rounded-full bg-warn animate-pulse" />
          </>
        ) : (
          <>
            <Mic className="size-4" />
            Record a voicenote
          </>
        )}
      </button>

      {/* Existing notes */}
      {loading ? (
        <p className="text-[11px] text-muted-foreground italic px-1">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground px-1">
          Tell future-you what you love or want to avoid about this product.
        </p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => {
            const playing = playingId === note.id;
            return (
              <div
                key={note.id}
                className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-[10px]"
              >
                <button
                  type="button"
                  onClick={() => playPause(note)}
                  disabled={!note.signedUrl}
                  className="size-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-50"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">
                    {formatDuration(note.duration_sec)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(note.created_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteNote(note)}
                  className="size-9 rounded-full text-muted-foreground hover:text-warn flex items-center justify-center shrink-0"
                  aria-label="Delete voicenote"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductVoicenotes;
