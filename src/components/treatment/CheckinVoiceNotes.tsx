import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Mic, Play, Square, Trash2, Type } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useSignedMedia } from "@/hooks/useSignedMedia";
import {
  TreatmentMediaError,
  VOICE_MAX_SECONDS,
  baseMime,
  deleteTreatmentMedia,
  formatClock,
  uploadTreatmentMedia,
  type TreatmentMediaRow,
} from "@/lib/treatmentMedia";

interface Props {
  userId: string;
  planId: string;
  checkinId: string | null;
  notes: TreatmentMediaRow[];
  onUploaded: (row: TreatmentMediaRow) => void;
  onRemoved: (row: TreatmentMediaRow) => void;
  /**
   * When given, a saved voice note is transcribed and the words are handed back
   * so they can land in her written answer. The audio stays saved either way.
   */
  onTranscript?: (text: string) => void;
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(((r.result as string) ?? "").split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

/** Twelve bars that move while recording. Purely a sense of "it's listening". */
const Waveform = ({ active }: { active: boolean }) => (
  <div className="flex items-end gap-[3px] h-6" aria-hidden>
    {Array.from({ length: 12 }, (_, i) => (
      <span
        key={i}
        className={cn(
          "w-[3px] rounded-full bg-primary/70",
          active ? "animate-pulse" : "opacity-40",
        )}
        style={{
          height: active ? `${8 + ((i * 7) % 16)}px` : "6px",
          animationDelay: `${i * 70}ms`,
          animationDuration: "900ms",
        }}
      />
    ))}
  </div>
);

/**
 * Voice notes for a check-in. Tap to start, tap to stop, hear it back before it
 * saves. Three minute cap with a countdown as it gets close.
 */
const CheckinVoiceNotes = ({
  userId,
  planId,
  checkinId,
  notes,
  onUploaded,
  onRemoved,
  onTranscript,
}: Props) => {
  const [pending, setPending] = useState<{ blob: Blob; mime: string; seconds: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const previewUrl = useMemo(() => (pending ? URL.createObjectURL(pending.blob) : null), [pending]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const { recording, elapsedMs, error, start, stop, cancel, setError } = useVoiceRecorder((rec) => {
    setPending({
      blob: rec.blob,
      mime: baseMime(rec.mimeType),
      seconds: Math.round(rec.durationMs / 1000),
    });
  });

  const elapsed = Math.floor(elapsedMs / 1000);
  const remaining = VOICE_MAX_SECONDS - elapsed;

  // Hard cap — stops itself rather than letting the file grow past the limit.
  useEffect(() => {
    if (recording && remaining <= 0) stop();
  }, [recording, remaining, stop]);

  const { urls } = useSignedMedia(notes.map((n) => n.storage_path));

  /** Turns the words into text for her written answer. The audio stays saved. */
  const transcribe = async (blob: Blob, mime: string) => {
    if (!onTranscript) return;
    setTranscribing(true);
    try {
      const audioBase64 = await blobToBase64(blob);
      const { data, error: fnError } = await supabase.functions.invoke("transcribe-audio", {
        body: { audioBase64, mimeType: mime || "audio/webm" },
      });
      if (fnError) throw fnError;
      const text = ((data as { text?: string } | null)?.text ?? "").trim();
      if (!text) {
        toast("No speech picked up in that one — the voice note is still saved.");
        return;
      }
      onTranscript(text);
      toast.success("Added to your answer");
    } catch {
      toast("Couldn't turn that into text — the voice note is still saved.");
    } finally {
      setTranscribing(false);
    }
  };

  const save = async (withTranscript: boolean) => {
    if (!pending || !checkinId) return;
    const { blob, mime } = pending;
    setSaving(true);
    try {
      const row = await uploadTreatmentMedia({
        userId,
        planId,
        checkinId,
        mediaType: "audio",
        file: pending.blob,
        mimeType: pending.mime,
        durationSeconds: pending.seconds,
      });
      onUploaded(row);
      setPending(null);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2600);
      if (withTranscript) void transcribe(blob, mime);
    } catch (e) {
      toast.error(e instanceof TreatmentMediaError ? e.message : "That voice note didn't save.");
    }
    setSaving(false);
  };

  const remove = async (row: TreatmentMediaRow) => {
    try {
      await deleteTreatmentMedia(row);
      onRemoved(row);
    } catch {
      toast.error("Couldn't remove that voice note just now.");
    }
  };

  return (
    <SurfaceCard className="space-y-3">
      <div>
        <p className="font-body text-[14px] font-semibold">Say a few words</p>
        <p className="font-body text-[12px] text-muted-foreground mt-0.5">
          Up to three minutes. Talking is usually quicker than typing.
        </p>
      </div>

      {notes.length > 0 && (
        <div className="space-y-1.5">
          {notes.map((n, i) => (
            <div key={n.id} className="flex items-center gap-2 rounded-[10px] bg-muted/50 px-3 py-2">
              <span className="font-body text-[12px] text-muted-foreground w-14 shrink-0">
                {n.duration_seconds ? formatClock(Number(n.duration_seconds)) : `Note ${i + 1}`}
              </span>
              {urls[n.storage_path] ? (
                <audio src={urls[n.storage_path]} controls className="h-8 flex-1 min-w-0" />
              ) : (
                <Loader2 className="size-4 animate-spin text-muted-foreground flex-1" />
              )}
              <button
                type="button"
                aria-label="Remove voice note"
                onClick={() => remove(n)}
                className="size-7 rounded-full border border-border flex items-center justify-center shrink-0"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {justSaved && (
        <p className="font-body text-[12px] text-good flex items-center gap-1.5">
          <Check className="size-3.5" /> Voice note saved
        </p>
      )}

      {pending ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-[10px] bg-primary/5 border border-primary/20 px-3 py-2">
            <Play className="size-4 text-primary shrink-0" aria-hidden />
            {previewUrl && <audio src={previewUrl} controls className="h-8 flex-1 min-w-0" />}
            <span className="font-body text-[12px] text-muted-foreground shrink-0">
              {formatClock(pending.seconds)}
            </span>
          </div>
          <div className="space-y-2">
            {onTranscript && (
              <Button
                className="rounded-pill w-full"
                onClick={() => void save(true)}
                disabled={saving || transcribing || !checkinId}
              >
                {saving || transcribing ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <Type className="size-4 mr-1.5" />
                )}
                {transcribing ? "Writing it out…" : "Keep it and write it out for me"}
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={onTranscript ? "outline" : "default"}
                className="rounded-pill"
                onClick={() => void save(false)}
                disabled={saving || !checkinId}
              >
                {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Check className="size-4 mr-1.5" />}
                {saving ? "Saving…" : onTranscript ? "Keep the voice note only" : "Keep it"}
              </Button>
              <Button variant="outline" className="rounded-pill" onClick={() => setPending(null)}>
                Record again
              </Button>
            </div>
          </div>
        </div>
      ) : recording ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-[10px] bg-primary/5 border border-primary/20 px-3 py-2.5">
            <Waveform active />
            <span className="font-body text-[14px] tabular-nums">{formatClock(elapsed)}</span>
            {remaining <= 30 && (
              <span className="font-body text-[12px] text-muted-foreground ml-auto">
                {formatClock(Math.max(0, remaining))} left
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="rounded-pill" onClick={stop}>
              <Square className="size-4 mr-1.5" /> Done
            </Button>
            <Button variant="outline" className="rounded-pill" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!checkinId}
          onClick={() => {
            setError(null);
            void start();
          }}
          className="w-full rounded-pill bg-primary text-primary-foreground py-2.5 font-body text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Mic className="size-4" /> {notes.length ? "Record another" : "Start recording"}
        </button>
      )}

      {error && <p className="font-body text-[12px] text-muted-foreground">{error}</p>}
    </SurfaceCard>
  );
};

export default CheckinVoiceNotes;
