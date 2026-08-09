// Emails the recipient of an admin ("STRAND Team") chat message.
// Transactional + essential: it is required to provide the service, so it
// ignores marketing preferences and carries no unsubscribe link.
// The message body is NEVER reproduced — the CTA deep links to the thread.
// Fire-and-forget: always returns 200 so the DB trigger never blocks the insert.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dispatchEmail, serviceClient } from "../_shared/app-email/core.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { message_id } = await req.json().catch(() => ({}));
    if (typeof message_id !== "string" || !message_id) {
      return json({ ok: false, reason: "missing message_id" });
    }

    const admin = serviceClient();

    const { data: msg } = await admin
      .from("chat_messages")
      .select("id, thread_id, sender_id, sender_role, kind, created_at")
      .eq("id", message_id)
      .maybeSingle();
    if (!msg) return json({ ok: false, reason: "message_not_found" });
    if (msg.kind !== "text") return json({ ok: true, skipped: "not_text" });

    const { data: thread } = await admin
      .from("chat_threads")
      .select("id, thread_type, admin_user_id, subject_user_id")
      .eq("id", msg.thread_id)
      .maybeSingle();
    if (!thread) return json({ ok: false, reason: "thread_not_found" });
    if (thread.thread_type !== "admin_support") return json({ ok: true, skipped: "not_support" });

    const fromAdmin = msg.sender_role === "admin" || msg.sender_id === thread.admin_user_id;
    if (!fromAdmin) return json({ ok: true, skipped: "not_from_admin" });

    const recipientId = thread.subject_user_id;
    if (!recipientId || recipientId === msg.sender_id) {
      return json({ ok: true, skipped: "no_recipient" });
    }

    const { data: userRes } = await admin.auth.admin.getUserById(recipientId);
    const email = userRes?.user?.email;
    if (!email) return json({ ok: true, skipped: "no_email" });

    const received = new Date(msg.created_at as string).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const result = await dispatchEmail(
      {
        templateKey: "strand-message-received",
        to: email,
        recipientUserId: recipientId,
        triggerEvent: "chat_message.admin_sent",
        relatedTable: "chat_messages",
        relatedId: String(msg.id),
        idempotencyKey: `strand-message-received:${msg.id}`,
        data: { received, path: `/messages/${msg.thread_id}` },
      },
      admin,
    );

    if (!result.sent) console.warn("notify-message-recipient: not sent", JSON.stringify(result));
    return json({ ok: true, ...result });
  } catch (err) {
    console.error("notify-message-recipient error", err);
    return json({ ok: true, error: String(err) });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
