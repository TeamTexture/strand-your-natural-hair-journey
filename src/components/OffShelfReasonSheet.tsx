// Sheet shown when a user takes a product off their active shelf. Captures
// WHY: a free-text note plus an optional voice note that we upload to the
// `voicenotes` bucket and transcribe via the existing transcribe-audio edge
// function. Stores the result on user_products.off_shelf_reason /
// off_shelf_voice_url and then flips on_shelf=false.
import { uuid } from "@/lib/uuid";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productKey: string;
  productName: string;
  /**
   * Called after the row has been updated (reason + voice URL persisted and
   * on_shelf flipped to false). The parent decides what to do next — usually
   * a toast + navigate.
   */
  onComplete: () => Promise<void> | void;
}

const formatDuration = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // strip the `data:audio/webm;base64,` prefix
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const OffShelfReasonSheet = ({
  open,
  onOpenChange,
  productId,
  productKey,
  productName,
  onComplete,
}: Props) => {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [recording, setRecording] = useState(false);
  const [recDuration, setRecDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recStartRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  // Reset whenever the sheet closes so the next open is clean.
  useEffect(() => {
    if (!open) {
      setNote("");
      setRecording(false);
      setRecDuration(0);
      setAudioBlob(null);
      setTranscribing(false);
      setSubmitting(false);
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [open]);

  const startRecording = async () => {
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
      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        // Auto-transcribe so the text box is pre-filled — user can edit.
        try {
          setTranscribing(true);
          const base64 = await blobToBase64(blob);
          const { data, error } = await supabase.functions.invoke(
            "transcribe-audio",
            { body: { audioBase64: base64, mimeType: "audio/webm" } },
          );
          if (error) throw error;
          const text = (data?.text ?? "").toString().trim();
          if (text) {
            setNote((prev) => (prev ? `${prev}\n${text}` : text));
          }
        } catch (e) {
          console.error("transcribe failed", e);
          toast.error("Could not transcribe — voice note saved as audio only");
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      recStartRef.current = Date.now();
      setRecDuration(0);
      setRecording(true);
      tickRef.current = window.setInterval(() => {
        setRecDuration((Date.now() - recStartRef.current) / 1000);
      }, 250);
    } catch (e) {
      console.error("mic denied", e);
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
    mediaRecorderRef.current.stop();
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setRecording(false);
  };

  const clearAudio = () => {
    setAudioBlob(null);
    setRecDuration(0);
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error("Please sign in");
      return;
    }
    setSubmitting(true);
    try {
      let voicePath: string | null = null;
      if (audioBlob) {
        const filename = `${user.id}/${productKey}/off-shelf-${uuid()}.webm`;
        const { error: upErr } = await supabase.storage
          .from("voicenotes")
          .upload(filename, audioBlob, { contentType: "audio/webm" });
        if (upErr) throw upErr;
        voicePath = filename;
      }
      const { error: updErr } = await supabase
        .from("user_products")
        .update({
          on_shelf: false,
          previously_on_shelf: true,
          off_shelf_reason: note.trim() || null,
          off_shelf_voice_url: voicePath,
        })
        .eq("id", productId);
      if (updErr) throw updErr;
      toast.success(`${productName} moved off your shelf`);
      onOpenChange(false);
      await onComplete();
    } catch (e) {
      console.error("off-shelf submit failed", e);
      toast.error("Could not save — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  const skipReason = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("user_products")
        .update({ on_shelf: false, previously_on_shelf: true })
        .eq("id", productId);
      if (error) throw error;
      toast(`${productName} moved off your shelf`);
      onOpenChange(false);
      await onComplete();
    } catch (e) {
      console.error("skip off-shelf failed", e);
      toast.error("Could not save — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <SheetContent side="bottom" className="rounded-t-[24px] pb-8">
        <SheetHeader className="text-left">
          <SheetTitle className="font-display">Why are you removing this product?</SheetTitle>
          <SheetDescription className="text-xs">
            Optional — tell future-you what didn't work. Type, record a voice
            note, or both. We'll use this to spot patterns across products
            you've taken off your shelf.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. left my hair flat, scalp itched, smell too strong…"
            className="min-h-[100px] text-sm"
            disabled={submitting}
          />

          {!audioBlob ? (
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={submitting || transcribing}
              className={cn(
                "w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-[10px] border min-h-[48px] font-body text-sm transition-colors",
                recording
                  ? "bg-warn/10 border-warn text-warn"
                  : "bg-card border-border text-foreground hover:border-primary/50",
              )}
            >
              {recording ? (
                <>
                  <Square className="size-4 fill-current" />
                  Stop · {formatDuration(recDuration)}
                  <span className="ml-1 size-2 rounded-full bg-warn animate-pulse" />
                </>
              ) : (
                <>
                  <Mic className="size-4" />
                  Record a voice note
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-[10px]">
              <div className="size-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                <Mic className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">
                  Voice note · {formatDuration(recDuration)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {transcribing ? "Transcribing into the note above…" : "Saved with this entry"}
                </p>
              </div>
              <button
                type="button"
                onClick={clearAudio}
                disabled={submitting || transcribing}
                className="size-9 rounded-full text-muted-foreground hover:text-warn flex items-center justify-center shrink-0"
                aria-label="Discard voice note"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )}

          <Button
            variant="gold"
            size="pill"
            onClick={handleSubmit}
            disabled={submitting || transcribing || recording}
            className="w-full"
          >
            {submitting ? (
              <><Loader2 className="size-4 mr-2 animate-spin" /> Saving…</>
            ) : (
              "Take off the shelf"
            )}
          </Button>
          <Button
            variant="ghost"
            size="pill"
            onClick={skipReason}
            disabled={submitting || recording}
            className="w-full"
          >
            Skip — just remove it
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default OffShelfReasonSheet;
