// Emails the recipient of an admin ("STRAND Team") chat message.
// Transactional + essential: it is required to provide the service, so it
// ignores marketing preferences and carries no unsubscribe link.
// The message body is NEVER reproduced — the CTA deep links to the thread.
// Fire-and-forget: always returns 200 so the DB trigger never blocks the insert.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dispatchEmail, serviceClient } from "../_shared/app-email/core.ts";
import { resolveAdminEmails } from "../_shared/app-email/admins.ts";
import { authoriseTriggerCall } from "../_shared/app-email/trigger-auth.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Only the database trigger (or a service-role caller) may send these emails.
  const denied = authoriseTriggerCall(req);
  if (denied) return json(denied.body, denied.status);

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
    // Text, image and voice messages all warrant an email; system rows do not.
    if (msg.kind !== "text" && msg.kind !== "image" && msg.kind !== "voice") {
      return json({ ok: true, skipped: "not_notifiable" });
    }

    const { data: thread } = await admin
      .from("chat_threads")
      .select("id, thread_type, admin_user_id, subject_user_id")
      .eq("id", msg.thread_id)
      .maybeSingle();
    if (!thread) return json({ ok: false, reason: "thread_not_found" });
    if (thread.thread_type !== "admin_support") return json({ ok: true, skipped: "not_support" });

    // Direction is decided by who the sender ACTUALLY is, not by the
    // `sender_role` tag on the row: that tag is written from whichever role view
    // the sender happened to be in, so an admin replying while viewing STRAND as
    // a member was being mistaken for an inbound reply — the member never got her
    // email and the admin team got one instead. The role table is the truth, and
    // it also covers a second admin answering a thread another admin opened.
    let senderIsAdmin =
      msg.sender_role === "admin" || msg.sender_id === thread.admin_user_id;
    if (!senderIsAdmin && msg.sender_id) {
      const { data: adminRole } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", msg.sender_id)
        .eq("role", "admin")
        .maybeSingle();
      senderIsAdmin = Boolean(adminRole);
    }
    const fromAdmin = senderIsAdmin;

    // Inbound reply (member / pro / brand → STRAND): email the admin team.
    if (!fromAdmin) {
      const recipients = await resolveAdminEmails(admin);
      if (recipients.length === 0) return json({ ok: true, skipped: "no_admin_recipients" });

      const { data: prof } = await admin
        .from("profiles")
        .select("display_name")
        .eq("user_id", msg.sender_id)
        .maybeSingle();
      const { data: proProf } = await admin
        .from("pro_profiles")
        .select("display_name")
        .eq("user_id", msg.sender_id)
        .maybeSingle();

      const receivedAt = new Date(msg.created_at as string).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      });

      const inbound = await dispatchEmail(
        {
          templateKey: "admin-new-message",
          to: recipients,
          triggerEvent: "chat_message.reply_received",
          relatedTable: "chat_messages",
          relatedId: String(msg.id),
          idempotencyKey: `admin-new-message:${msg.id}`,
          data: {
            fromName:
              proProf?.display_name || prof?.display_name || "A STRAND member",
            subject:
              msg.kind === "voice"
                ? "Replied with a voice note"
                : msg.kind === "image"
                  ? "Replied with a photo"
                  : "Replied to your message",
            received: receivedAt,
            path: `/messages/${msg.thread_id}`,
          },
        },
        admin,
      );
      if (!inbound.sent) console.warn("notify-message-recipient: admin not sent", JSON.stringify(inbound));
      return json({ ok: true, direction: "to_admin", ...inbound });
    }

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

// Admin recipients: the configured notification address(es) plus every admin account.

