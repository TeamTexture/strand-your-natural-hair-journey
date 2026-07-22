// Realtime listener for incoming chat messages while the user is actively
// using the app. Fires a callback per new message that was NOT sent by the
// current user. Used by:
//   - IncomingMessageBanner (top-of-screen toast when app is active)
//   - Badge sync via query invalidation (handled elsewhere)
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ChatMessage } from "@/hooks/useChat";

export function useIncomingChatMessages(onMessage: (m: ChatMessage) => void) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!user?.id) return;

    // Subscribe to every chat_messages insert; server-side RLS ensures we
    // only receive rows for threads the user participates in.
    const channel = supabase
      .channel(`chat_incoming_${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const row = payload.new as ChatMessage;
          if (!row || row.sender_id === user.id) return;
          if (row.kind !== "text") return;
          cbRef.current(row);
          qc.invalidateQueries({ queryKey: ["chat_unread", user.id] });
          qc.invalidateQueries({ queryKey: ["chat_threads", user.id] });
          qc.invalidateQueries({ queryKey: ["chat_messages", row.thread_id] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);
}
