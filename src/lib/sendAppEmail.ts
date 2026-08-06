import { supabase } from "@/integrations/supabase/client";

/**
 * The ONLY client-side entry point for sending an app email.
 * Never compose email bodies in feature code — pass a template key and data.
 * Sending is globally gated: while the flag is off, the send is logged with
 * status "suppressed" and nothing is transmitted.
 */
export interface SendAppEmailInput {
  templateKey: string;
  to: string;
  recipientUserId?: string | null;
  triggerEvent: string;
  relatedTable?: string | null;
  relatedId?: string | null;
  /** Derive from the triggering record so retries never duplicate a send. */
  idempotencyKey?: string | null;
  data?: Record<string, unknown>;
}

export async function sendAppEmail(input: SendAppEmailInput): Promise<boolean> {
  if (!input.to?.trim()) return false;
  try {
    const { error } = await supabase.functions.invoke("send-app-email", {
      body: input,
    });
    return !error;
  } catch {
    // Email delivery must never break the user-facing action that triggered it.
    return false;
  }
}
