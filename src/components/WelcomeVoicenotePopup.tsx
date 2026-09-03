// Centred "New message from STRAND Team" popup.
//
// Surfaces the one-off welcome voice note (sent by
// supabase/functions/_shared/welcome-dm.ts, flagged with
// meta->>'welcome_voicenote') immediately after the member completes OR skips
// the Home tour. It never fires on Minimise — it listens only for
// TOUR_DONE_EVENT, which HomeTour dispatches from finish().
//
// Additive by design: nothing in HomeTour changes. Playback reuses the exact
// signed-URL + play/pause pattern of ChatVoiceBubble, and the transcript stays
// behind a "Read transcript" toggle.
//
// PERSISTENCE (2026-09-03): the popup used to write a "shown" flag the instant
// it opened and then re-read that same flag inside its own `open` expression, so
// the next render (the signed audio URL landing) closed it — the member saw a
// flash and lost the message. It now stays up until she has genuinely LISTENED
// (VoicePlayer's onPlay), and "Minimise" only snoozes it for the session.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Mic, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChatAudioUrl } from "@/components/chat/ChatVoiceBubble";
import VoicePlayer from "@/components/voice/VoicePlayer";
import { TOUR_DONE_EVENT, tourFinished } from "@/lib/firstRunTour";
import {
  hasListenedToWelcome,
  isWelcomeSnoozed,
  markWelcomeListened,
  snoozeWelcome,
} from "@/lib/welcomeVoicenote";


interface WelcomeMessage {
  id: string;
  thread_id: string;
  body: string | null;
  audio_path: string | null;
  duration_ms: number | null;
  transcript: string | null;
}

const WelcomeVoicenotePopup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Armed by the tour finishing — and on any later app open once the tour is
  // already done, so a voice note she minimised comes back until she plays it.
  const [armed, setArmed] = useState(() => tourFinished());
  const [dismissed, setDismissed] = useState(false);
  const [listened, setListened] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);


  // Only look for the message once the tour has genuinely finished/skipped.
  useEffect(() => {
    const on = () => setArmed(true);
    window.addEventListener(TOUR_DONE_EVENT, on);
    return () => window.removeEventListener(TOUR_DONE_EVENT, on);
  }, []);

  const { data: message } = useQuery({
    queryKey: ["welcome-voicenote-dm", user?.id],
    enabled: armed && !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<WelcomeMessage | null> => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, thread_id, body, meta, created_at")
        .eq("kind", "voice")
        .eq("meta->>welcome_voicenote", "true")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const meta = (data.meta ?? {}) as Record<string, unknown>;
      return {
        id: data.id as string,
        thread_id: data.thread_id as string,
        body: (data.body as string | null) ?? null,
        audio_path: (meta.audio_path as string | null) ?? null,
        duration_ms: (meta.duration_ms as number | null) ?? null,
        transcript:
          ((meta.transcript as string | null) ?? (data.body as string | null)) ?? null,
      };
    },
  });

  const open =
    armed &&
    !dismissed &&
    !listened &&
    !!message &&
    !isWelcomeSnoozed(user?.id) &&
    !hasListenedToWelcome(user?.id, message.id);

  const { data: url } = useChatAudioUrl(open ? message?.audio_path : null);

  if (!open || !message) return null;

  // Unmounting the popup unmounts VoicePlayer, which pauses and tears down its
  // own audio element — nothing else to stop here.
  const minimise = () => {
    // Not dismissed for good — it comes back next time she opens the app until
    // the voice note has actually been played.
    snoozeWelcome(user?.id);
    setDismissed(true);
  };

  const openChat = () => {
    setDismissed(true);
    navigate(`/messages/${message.thread_id}`);
  };

  // Playing it here counts as listened, and so does playing it in the thread
  // (ChatThreadPage marks the same flag).
  const onListened = () => {
    markWelcomeListened(user?.id, message.id);
    setListened(true);
  };




  const transcript = message.transcript?.trim();

  return (
    <div
      className="fixed inset-0 z-[92] flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-label="New message from STRAND Team"
    >
      <button
        type="button"
        aria-label="Minimise"
        onClick={minimise}
        className="absolute inset-0 bg-foreground/55 backdrop-blur-[1px]"
      />
      <div className="relative w-full max-w-[320px] rounded-[20px] bg-background border border-primary/30 shadow-xl p-5">
        <button
          type="button"
          onClick={minimise}
          aria-label="Minimise"
          className="absolute top-3 right-3 size-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <p className="text-[10.5px] uppercase tracking-[0.14em] font-body font-semibold text-primary">
          New message
        </p>
        <h2 className="font-display text-[19px] leading-tight text-foreground pr-6">
          New message from STRAND Team
        </h2>

        <div className="mt-4 rounded-[14px] border border-border bg-muted/40 px-3 py-3">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] font-body font-semibold text-foreground">
            <Mic className="size-3" />
            Voice note
          </span>
          <VoicePlayer
            url={url}
            durationMs={message.duration_ms}
            variant="onSurface"
            onPlay={onListened}
            className="mt-2 text-foreground"
          />
        </div>


        {transcript && (
          <>
            <button
              type="button"
              onClick={() => setShowTranscript((v) => !v)}
              className="mt-3 text-[10.5px] uppercase tracking-[0.12em] font-body underline underline-offset-2 text-muted-foreground"
            >
              {showTranscript ? "Hide transcript" : "Read transcript"}
            </button>
            {showTranscript && (
              <p className="mt-2 max-h-40 overflow-y-auto text-[12.5px] font-body leading-snug text-foreground whitespace-pre-wrap break-words">
                {transcript}
              </p>
            )}
          </>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={openChat}
            className="w-full h-11 rounded-pill bg-primary text-primary-foreground font-body text-[13px] uppercase tracking-[0.12em] font-semibold"
          >
            Open chat
          </button>
          <button
            type="button"
            onClick={minimise}
            className="w-full h-10 rounded-pill border border-border font-body text-[12.5px] uppercase tracking-[0.12em] text-muted-foreground"
          >
            Minimise
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeVoicenotePopup;
