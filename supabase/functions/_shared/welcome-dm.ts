// One-off welcome voice note from STRAND Team.
//
// Sent the first time a member reaches `trialing` or `active`. It reuses the
// admin_support chat thread pattern (exactly as admin_broadcast_message and
// admin_start_support_thread do), so the recipient gets the normal chat side
// effects — unread badge and the "strand-message-received" email — for free.
//
// The audio object is uploaded ONCE by the admin in the Welcome Voicenote
// screen; every member's message row points at that same storage path.
//
// Never throws: the caller is a Stripe webhook and a failure here must never
// cause a retry or a 500.

// deno-lint-ignore-file no-explicit-any

export async function sendWelcomeVoicenote(
  admin: any,
  userId: string,
): Promise<void> {
  try {
    // Permanent one-per-account guard — never reset on cancel or resubscribe.
    const { data: subRow, error: subErr } = await admin
      .from("consumer_subscriptions")
      .select("welcome_dm_sent_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (subErr) throw subErr;
    if (!subRow) {
      console.log("[welcome-dm] no consumer_subscriptions row yet", userId);
      return;
    }
    if (subRow.welcome_dm_sent_at) return;

    const { data: vn, error: vnErr } = await admin
      .from("welcome_voicenote")
      .select("audio_path, transcript, duration_ms, updated_by")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (vnErr) throw vnErr;
    if (!vn?.audio_path) {
      console.log("[welcome-dm] skipped — no welcome voicenote recorded yet", userId);
      return;
    }

    // Same admin_user_id convention as the admin chat RPCs: the admin who owns
    // the message. Here that is the admin who recorded the welcome note.
    const adminUserId = vn.updated_by as string;

    let threadId: string | null = null;
    const { data: existing, error: findErr } = await admin
      .from("chat_threads")
      .select("id")
      .eq("thread_type", "admin_support")
      .eq("admin_user_id", adminUserId)
      .eq("subject_user_id", userId)
      .limit(1)
      .maybeSingle();
    if (findErr) throw findErr;
    threadId = existing?.id ?? null;

    if (!threadId) {
      const { data: created, error: createErr } = await admin
        .from("chat_threads")
        .insert({
          thread_type: "admin_support",
          admin_user_id: adminUserId,
          subject_user_id: userId,
          subject_role: "consumer",
        })
        .select("id")
        .single();
      if (createErr) throw createErr;
      threadId = created.id as string;
      await admin.from("chat_messages").insert({
        thread_id: threadId,
        sender_id: null,
        kind: "system",
        body: "Chat opened by STRAND Team.",
      });
    }

    const transcript = (vn.transcript ?? "").toString().trim() || null;
    const { error: msgErr } = await admin.from("chat_messages").insert({
      thread_id: threadId,
      sender_id: adminUserId,
      sender_role: "admin",
      kind: "voice",
      body: transcript ?? "Voice note",
      meta: {
        audio_path: vn.audio_path,
        duration_ms: vn.duration_ms ?? null,
        transcript,
        welcome_voicenote: true,
      },
    });
    if (msgErr) throw msgErr;

    // Same moment, same admin sender: the free 1:1 invitation as a tappable
    // link card (a normal `text` row whose meta carries the link).
    const calendlyUrl =
      "https://calendly.com/paigelewinconsulting/1-1-strand-walkthrough-with-paige";
    const { error: linkErr } = await admin.from("chat_messages").insert({
      thread_id: threadId,
      sender_id: adminUserId,
      sender_role: "admin",
      kind: "text",
      body:
        "Book your free 1:1 with Paige — a quick walkthrough of STRAND, one to one, no charge. " +
        calendlyUrl,
      meta: {
        link: { url: calendlyUrl, label: "Book your free 1:1 with Paige" },
        welcome_calendly: true,
      },
    });
    if (linkErr) throw linkErr;

    const { error: stampErr } = await admin
      .from("consumer_subscriptions")
      .update({ welcome_dm_sent_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("welcome_dm_sent_at", null);
    if (stampErr) throw stampErr;

    console.log("[welcome-dm] sent", userId, threadId);
  } catch (e) {
    console.error("[welcome-dm] failed", userId, e);
  }
}
