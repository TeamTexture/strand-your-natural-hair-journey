import { useRef, useState } from "react";
import { Camera, Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { prepareImageForAi } from "@/lib/imagePrep";
import { useVoiceRecorder, formatVoiceDuration } from "@/hooks/useVoiceRecorder";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

/**
 * Two shortcuts for filling in "how you use it": read it off the pack, or just
 * say it out loud.
 *
 * PRE-FILL ONLY. Both routes drop text into the usage-notes field she already
 * has, and she edits it before the plan is saved. Nothing new is stored — no
 * audio file, no photo, no extra column — so nothing else in the app changes.
 */
const UsageNotesAssist = ({ value, onChange }: Props) => {
  const [scanning, setScanning] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const append = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    onChange(value.trim() ? `${value.trim()} ${clean}` : clean);
  };

  const scanLabel = async (file: File) => {
    setScanning(true);
    try {
      const prepared = await prepareImageForAi(file);
      const [, mime, b64] = prepared.dataUrl.match(/^data:([^;]+);base64,(.*)$/) ?? [];
      if (!b64) throw new Error("Could not read that photo");
      const { data, error } = await supabase.functions.invoke("product-usage-scan", {
        body: { image: { data: b64, mime } },
      });
      if (error) throw error;
      const text = String((data as { text?: unknown })?.text ?? "").trim();
      if (!text) {
        toast.error("Couldn't read directions there — try a clearer photo of the back");
        return;
      }
      append(text);
      toast.success("Read from the pack — have a check before you save");
    } catch (e) {
      console.error("usage label scan failed", e);
      toast.error("Couldn't read that label just now");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const recorder = useVoiceRecorder(async ({ blob, mimeType }) => {
    setTranscribing(true);
    try {
      const buf = await blob.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: { audioBase64: btoa(binary), mimeType },
      });
      if (error) throw error;
      const text = String((data as { text?: unknown })?.text ?? "").trim();
      if (!text) {
        toast.error("Didn't catch that — try again");
        return;
      }
      append(text);
    } catch (e) {
      console.error("usage note transcription failed", e);
      toast.error("Couldn't turn that into text just now");
    } finally {
      setTranscribing(false);
    }
  });

  const busy = scanning || transcribing;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void scanLabel(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-pill flex-1 font-body text-[12px]"
          disabled={busy || recorder.recording}
          onClick={() => fileRef.current?.click()}
        >
          {scanning ? (
            <Loader2 className="size-3.5 mr-1.5 animate-spin" />
          ) : (
            <Camera className="size-3.5 mr-1.5" />
          )}
          Scan the label
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-pill flex-1 font-body text-[12px]"
          disabled={scanning || transcribing}
          onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
        >
          {transcribing ? (
            <Loader2 className="size-3.5 mr-1.5 animate-spin" />
          ) : recorder.recording ? (
            <Square className="size-3.5 mr-1.5 text-primary" />
          ) : (
            <Mic className="size-3.5 mr-1.5" />
          )}
          {recorder.recording ? formatVoiceDuration(recorder.elapsedMs) : "Say it"}
        </Button>
      </div>

      <p className="font-body text-[11px] text-muted-foreground leading-snug">
        {recorder.error
          ? recorder.error
          : transcribing
            ? "Writing that down…"
            : "Either one fills the box above — you can still edit it."}
      </p>
    </div>
  );
};

export default UsageNotesAssist;
