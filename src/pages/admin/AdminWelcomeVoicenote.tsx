// Welcome voicenote — recorded once, sent automatically to every member the
// first time she starts a free trial or becomes an active subscriber.
//
// Recording, upload and transcription reuse the exact broadcast plumbing
// (useVoiceRecorder / uploadChatVoice / transcribeChatVoice, chat-images
// bucket). Delivery happens server-side in consumer-stripe-webhook.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Mic, Save, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import VoicePlayer from "@/components/voice/VoicePlayer";

import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { smartBack } from "@/lib/smartBack";
import { formatVoiceDuration, useVoiceRecorder, type VoiceRecording } from "@/hooks/useVoiceRecorder";
import { CHAT_MEDIA_BUCKET, transcribeChatVoice, uploadChatVoice } from "@/lib/chatVoice";
import { uuid } from "@/lib/uuid";

interface WelcomeRow {
  id: string;
  audio_path: string;
  transcript: string | null;
  duration_ms: number | null;
  updated_at: string;
}

const AdminWelcomeVoicenote = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [clip, setClip] = useState<VoiceRecording | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const voice = useVoiceRecorder((rec) => {
    setClip(rec);
    setClipUrl(URL.createObjectURL(rec.blob));
  });

  useEffect(() => {
    if (voice.error) {
      toast.error(voice.error);
      voice.setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.error]);

  const current = useQuery({
    queryKey: ["admin", "welcome-voicenote"],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("welcome_voicenote")
        .select("id, audio_path, transcript, duration_ms, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: signed } = await supabase.storage
        .from(CHAT_MEDIA_BUCKET)
        .createSignedUrl((data as WelcomeRow).audio_path, 3600);
      return { row: data as WelcomeRow, url: signed?.signedUrl ?? null };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!clip || !user?.id) throw new Error("Record a voice note first");
      const path = await uploadChatVoice(uuid(), clip.blob, clip.mimeType);
      const transcript = await transcribeChatVoice(clip.blob, clip.mimeType);
      // Only one active version at a time — the new row replaces the old one.
      const existingId = current.data?.row.id;
      if (existingId) {
        const { error } = await supabase
          .from("welcome_voicenote")
          .update({
            audio_path: path,
            transcript,
            duration_ms: Math.round(clip.durationMs),
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("welcome_voicenote").insert({
          audio_path: path,
          transcript,
          duration_ms: Math.round(clip.durationMs),
          updated_by: user.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Welcome voicenote saved — new members will receive this one.");
      setClip(null);
      setClipUrl(null);
      void qc.invalidateQueries({ queryKey: ["admin", "welcome-voicenote"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const existing = current.data;

  return (
    <ScreenLayout>
      <TitleBar title="Welcome voicenote" onBack={smartBack(nav, "/admin/settings")} />

      <div className="px-5 pb-3">
        <p className="text-xs text-muted-foreground font-body leading-snug">
          Record this once. Every member receives it privately from "STRAND Team" the first time she
          starts her free trial or becomes an active subscriber — once per account, ever.
        </p>
      </div>

      <SectionLabel>Current recording</SectionLabel>
      <div className="px-5 pb-4">
        <SurfaceCard>
          {current.isLoading ? (
            <p className="text-[12px] font-body text-muted-foreground">Loading…</p>
          ) : !existing ? (
            <div className="flex items-start gap-2.5">
              <div className="size-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Mic className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="font-display text-[15px] leading-tight">Nothing recorded yet</p>
                <p className="text-[11.5px] font-body text-muted-foreground leading-snug mt-0.5">
                  Until you save one, no welcome message is sent — new trials are simply skipped.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <div className="size-9 rounded-full bg-primary/12 text-primary flex items-center justify-center shrink-0">
                  <CheckCircle2 className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-[15px] leading-tight">
                    Live · {formatVoiceDuration(existing.row.duration_ms ?? 0)}
                  </p>
                  <p className="text-[11px] font-body text-muted-foreground leading-snug mt-0.5">
                    Updated{" "}
                    {formatDistanceToNow(new Date(existing.row.updated_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
              {existing.url && (
                <VoicePlayer url={existing.url} variant="onSurface" className="text-foreground" />
              )}
              {existing.row.transcript && (
                <p className="text-[12px] font-body leading-relaxed text-foreground/80 [overflow-wrap:anywhere]">
                  “{existing.row.transcript}”
                </p>
              )}
            </div>
          )}
        </SurfaceCard>
      </div>

      <SectionLabel>{existing ? "Re-record" : "Record"}</SectionLabel>
      <div className="px-5 pb-8 space-y-3">
        <button
          type="button"
          onClick={voice.recording ? voice.stop : () => void voice.start()}
          className={`w-full flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.14em] px-4 py-3 rounded-pill border ${
            voice.recording
              ? "border-warn/50 bg-warn/10 text-warn"
              : "border-primary/30 text-primary hover:bg-primary/5"
          }`}
        >
          {voice.recording ? (
            <>
              <Square className="size-3.5 fill-current" />
              Stop {formatVoiceDuration(voice.elapsedMs)}
            </>
          ) : (
            <>
              <Mic className="size-4" />
              {clip ? "Record again" : existing ? "Record a new version" : "Start recording"}
            </>
          )}
        </button>

        {clip && !voice.recording && (
          <div className="rounded-2xl border border-border bg-card p-3 space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="shrink-0 size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Mic className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-body leading-snug">
                  New recording · {formatVoiceDuration(clip.durationMs)}
                </p>
                <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                  Preview it, then save to replace the live version. It is transcribed on save.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setClip(null);
                  setClipUrl(null);
                }}
                aria-label="Discard recording"
                className="shrink-0 size-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            {clipUrl && (
              <VoicePlayer url={clipUrl} variant="onSurface" className="text-foreground" />
            )}

          </div>
        )}

        <Button
          variant="gold"
          size="pill"
          className="w-full"
          disabled={!clip || voice.recording || save.isPending}
          onClick={() => void save.mutateAsync()}
        >
          <Save className="size-3.5 mr-1.5" />
          {save.isPending ? "Saving…" : existing ? "Replace welcome voicenote" : "Save welcome voicenote"}
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default AdminWelcomeVoicenote;
