import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlusAccess } from "@/hooks/usePlusAccess";
import type { ChatThread } from "@/hooks/useChat";

type ThreadLike = Pick<ChatThread, "id" | "thread_type" | "consumer_id" | "pro_user_id">;

/**
 * Client-side mirror of `public.can_send_chat_message`.
 *
 * A STRAND Basic member may message a professional until their FIRST
 * appointment with that professional has passed. After that, only STRAND+
 * unlocks further sending. Later appointments with the same pro never
 * re-lock or re-unlock anything — only the earliest one matters.
 *
 * This exists purely for instant UI feedback; the RLS policy on
 * `chat_messages` is the real enforcement, so a small race is acceptable.
 * Professionals, admin support threads and every other thread type are
 * never gated here.
 */
export function useCanSendChatMessage(thread: ThreadLike | null | undefined) {
  const { user } = useAuth();
  const { hasPlus, isLoading: plusLoading } = usePlusAccess();

  const isClientProConsumer =
    !!thread &&
    thread.thread_type === "client_pro" &&
    !!thread.pro_user_id &&
    !!user &&
    thread.pro_user_id !== user.id &&
    thread.consumer_id === user.id;

  // Only asked when the answer can actually matter.
  const needsCheck = isClientProConsumer && !plusLoading && !hasPlus;

  const q = useQuery({
    queryKey: ["chat_first_appointment", thread?.pro_user_id, user?.id],
    enabled: needsCheck,
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("appointments")
        .select("appointment_date")
        .eq("user_id", user!.id)
        .eq("linked_pro_user_id", thread!.pro_user_id!)
        .neq("status", "cancelled")
        .order("appointment_date", { ascending: true })
        .limit(1);
      if (error) throw error;
      return data?.[0]?.appointment_date ?? null;
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const firstAppointment = q.data ?? null;
  const firstAppointmentPassed = !!firstAppointment && firstAppointment < today;

  const locked = needsCheck && !q.isLoading && firstAppointmentPassed;

  return {
    /** False only when a Basic member's first appointment with this pro has passed. */
    canSend: !locked,
    locked,
    /** True when the thread is a consumer→pro thread that the lock can apply to. */
    lockRelevant: isClientProConsumer,
    isLoading: plusLoading || (needsCheck && q.isLoading),
  };
}

/** True when a failed insert looks like the chat-lock RLS rejection. */
export function isChatLockError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /row-level security|violates row-level|42501|permission denied/i.test(msg);
}
