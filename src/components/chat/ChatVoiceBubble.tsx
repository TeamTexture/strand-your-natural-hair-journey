// Renders a voice note sent inside a chat message.
//
// Audio lives in the private `chat-images` bucket, so playback needs a
// short-lived signed URL. A transcript (when one was captured) sits behind a
// "Read transcript" toggle so the bubble stays compact.

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { Mic } from "lucide-react";
import DeliveryTicks from "@/components/chat/DeliveryTicks";
import VoicePlayer from "@/components/voice/VoicePlayer";
import { supabase } from "@/integrations/supabase/client";
import { CHAT_MEDIA_BUCKET } from "@/lib/chatVoice";
import ReactableBubble, { stopBubbleGesture } from "@/components/chat/MessageReaction";
import type { ReactionState } from "@/hooks/useMessageReactions";


const SIGN_SECONDS = 60 * 60;

export const useChatAudioUrl = (path: string | null | undefined) =>
  useQuery({
    queryKey: ["chat-audio-url", path],
    enabled: !!path,
    staleTime: (SIGN_SECONDS - 300) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(CHAT_MEDIA_BUCKET)
        .createSignedUrl(path as string, SIGN_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
  });

interface Props {
  path: string | null | undefined;
  transcript?: string | null;
  durationMs?: number | null;
  createdAt: string;
  readAt?: string | null;
  mine: boolean;
  senderName?: string;
  showName?: boolean;
  reaction?: ReactionState;
  onToggleReaction?: () => void;
  reactionsDisabled?: boolean;
}

const ChatVoiceBubble = ({
  path,
  transcript,
  durationMs,
  createdAt,
  readAt,
  mine,
  senderName,
  showName,
  reaction,
  onToggleReaction,
  reactionsDisabled,
}: Props) => {
  const { data: url } = useChatAudioUrl(path);
  const [showTranscript, setShowTranscript] = useState(false);


  const tone = mine
    ? "bg-primary text-primary-foreground rounded-br-[6px]"
    : "bg-brown text-brown-foreground rounded-bl-[6px]";
  const soft = mine ? "text-primary-foreground/75" : "text-brown-foreground/75";

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"} mb-3`}>
      {showName && senderName && (
        <span
          className={`text-[10.5px] font-body font-semibold mb-0.5 px-1 ${
            mine ? "text-primary" : "text-brown"
          }`}
        >
          {senderName}
        </span>
      )}
      <ReactableBubble
        mine={mine}
        reaction={reaction}
        disabled={reactionsDisabled || !onToggleReaction}
        onToggle={() => onToggleReaction?.()}
        className={`max-w-[80%] px-3 py-2.5 rounded-[16px] ${tone}`}
      >
        <div className="w-[210px] max-w-full" {...stopBubbleGesture}>
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] font-body font-semibold">
            <Mic className="size-3" />
            Voice note
          </span>
          <VoicePlayer url={url} durationMs={durationMs ?? null} variant="onDark" className="mt-1.5" />
        </div>


        {transcript?.trim() && (
          <>
            <button
              type="button"
              onClick={() => setShowTranscript((v) => !v)}
              className={`mt-2 text-[10.5px] uppercase tracking-[0.12em] font-body underline underline-offset-2 ${soft}`}
            >
              {showTranscript ? "Hide transcript" : "Read transcript"}
            </button>
            {showTranscript && (
              <p className="mt-1.5 text-[12.5px] font-body leading-snug whitespace-pre-wrap break-words">
                {transcript}
              </p>
            )}
          </>
        )}

        <div className={`flex items-center justify-end gap-1 pt-1 text-[9.5px] ${soft}`}>
          <span>{format(new Date(createdAt), "HH:mm")}</span>
          {mine && (
            <DeliveryTicks
              readAt={readAt ?? null}
              className={readAt ? "" : "text-primary-foreground/85"}
            />
          )}
        </div>
      </ReactableBubble>
    </div>
  );
};

export default ChatVoiceBubble;
