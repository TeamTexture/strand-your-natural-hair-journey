// Heart reactions on chat messages.
//
// One heart per person per message (WhatsApp style). Reactions for the whole
// open thread load in a single query, shaped as message_id -> { total, mine }.
// Realtime inserts/deletes are picked up alongside the message subscription in
// useChatThread so a heart appears on both sides live.

import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const HEART = "❤️";

export interface ReactionState {
  total: number;
  mine: boolean;
}

export type ReactionMap = Record<string, ReactionState>;

type Row = { message_id: string; user_id: string };

const shape = (rows: Row[], myId: string | undefined): ReactionMap => {
  const map: ReactionMap = {};
  for (const r of rows) {
    const entry = (map[r.message_id] ??= { total: 0, mine: false });
    entry.total += 1;
    if (myId && r.user_id === myId) entry.mine = true;
  }
  return map;
};

export function useMessageReactions(
  threadId: string | null | undefined,
  messageIds: string[],
) {
  const qc = useQueryClient();
  const { user, isViewingAs } = useAuth();
  const key = useMemo(() => ["chat_reactions", threadId] as const, [threadId]);
  // Stable dependency for the id list so the query does not refetch on every
  // render of the thread.
  const idsKey = messageIds.join(",");

  const reactions = useQuery({
    queryKey: [...key, idsKey],
    enabled: !!threadId && messageIds.length > 0,
    queryFn: async (): Promise<ReactionMap> => {
      const { data, error } = await supabase
        .from("chat_message_reactions")
        .select("message_id, user_id")
        .in("message_id", messageIds);
      if (error) throw error;
      return shape((data ?? []) as Row[], user?.id);
    },
  });

  useEffect(() => {
    if (!threadId) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["chat_reactions", threadId] });
    };
    const channel = supabase
      .channel(`chat_reactions_${threadId}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_message_reactions" },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_message_reactions" },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, qc]);

  const toggle = useMutation({
    mutationFn: async (messageId: string) => {
      if (!user?.id) throw new Error("Not signed in");
      const { data: existing, error: readError } = await supabase
        .from("chat_message_reactions")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", HEART)
        .maybeSingle();
      if (readError) throw readError;
      if (existing?.id) {
        const { error } = await supabase
          .from("chat_message_reactions")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        return "removed" as const;
      }
      const { error } = await supabase
        .from("chat_message_reactions")
        .insert({ message_id: messageId, user_id: user.id, emoji: HEART });
      if (error) throw error;
      return "added" as const;
    },
    // Optimistic: flip my own heart straight away, roll back on failure.
    onMutate: async (messageId: string) => {
      const queryKey = [...key, idsKey];
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<ReactionMap>(queryKey);
      qc.setQueryData<ReactionMap>(queryKey, (old) => {
        const next: ReactionMap = { ...(old ?? {}) };
        const current = next[messageId] ?? { total: 0, mine: false };
        next[messageId] = current.mine
          ? { total: Math.max(0, current.total - 1), mine: false }
          : { total: current.total + 1, mine: true };
        return next;
      });
      return { previous, queryKey };
    },
    onError: (_err, _messageId, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(ctx.queryKey, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["chat_reactions", threadId] });
    },
  });

  return {
    reactions: reactions.data ?? {},
    // An admin browsing as a member must never write a reaction as that member.
    canReact: !!user?.id && !isViewingAs,
    toggleReaction: (messageId: string) => {
      if (!user?.id || isViewingAs) return;
      toggle.mutate(messageId);
    },
  };
}
