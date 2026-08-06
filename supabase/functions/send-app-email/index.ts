// SINGLE SEND PATH for every app email. No feature composes or transmits email
// itself — everything calls this function with a template key.
//
// Behaviour:
//  - Global flag `email_sending_enabled` in platform_settings defaults to FALSE.
//    While it is false, every request is written to email_log with status
//    "suppressed" and NOTHING is transmitted.
//  - Marketing templates require email_preferences.marketing_consent = true.
//  - Optional transactional templates respect their preference switch.
//    Essential templates ignore preferences.
//  - Idempotency key prevents duplicate sends on retry.
//  - Transient failures (429 / 5xx / network) retry with a cap; permanent
//    failures are logged as "failed", never silently dropped.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { getTemplate } from "../_shared/app-email/templates.ts";
import { renderEmail } from "../_shared/app-email/render.ts";

const MAX_ATTEMPTS = 3;
const APP_URL = "https://mystrand.co.uk";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SendBody {
  templateKey: string;
  to: string;
  recipientUserId?: string | null;
  triggerEvent: string;
  relatedTable?: string | null;
  relatedId?: string | null;
  idempotencyKey?: string | null;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const to = String(body.to ?? "").trim().toLowerCase();
  const templateKey = String(body.templateKey ?? "").trim();
  const triggerEvent = String(body.triggerEvent ?? templateKey).trim();
  const data = (body.data && typeof body.data === "object" ? body.data : {}) as Record<
    string,
    unknown
  >;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || to.length > 254) {
    return json({ error: "A valid recipient email is required." }, 400);
  }
  const template = getTemplate(templateKey);
  if (!template) return json({ error: `Unknown template: ${templateKey}` }, 400);

  const relatedId =
    typeof body.relatedId === "string" && body.relatedId ? body.relatedId : null;
  const recipientUserId =
    typeof body.recipientUserId === "string" && body.recipientUserId
      ? body.recipientUserId
      : null;
  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim().slice(0, 200)
      : null;

  // --- Idempotency: never send the same logical email twice.
  if (idempotencyKey) {
    const { data: existing } = await admin
      .from("email_log")
      .select("id,status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      return json({ ok: true, deduped: true, logId: existing.id, status: existing.status });
    }
  }

  const subject = template.subject(data).slice(0, 200);

  // --- Consent and preference gate.
  let suppressedReason: string | null = null;
  let prefs: Record<string, unknown> | null = null;
  if (recipientUserId) {
    const { data: p } = await admin
      .from("email_preferences")
      .select("*")
      .eq("user_id", recipientUserId)
      .maybeSingle();
    prefs = p ?? null;
  }

  if (template.category === "marketing") {
    // Marketing REQUIRES explicit consent. No consent record = no send.
    if (!prefs || prefs.marketing_consent !== true) {
      suppressedReason = "no_marketing_consent";
    }
  } else if (!template.essential && template.preference && prefs) {
    if (prefs[template.preference] === false) {
      suppressedReason = `preference_off:${template.preference}`;
    }
  }

  // --- Global send flag (defaults OFF).
  const { data: flagRow } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "email_sending_enabled")
    .maybeSingle();
  const sendingEnabled = flagRow?.value === true;
  if (!suppressedReason && !sendingEnabled) suppressedReason = "global_flag_off";

  const unsubscribeUrl =
    template.category === "marketing" && prefs?.unsubscribe_token
      ? `${APP_URL}/email-preferences?unsubscribe=${prefs.unsubscribe_token}`
      : null;

  const { html, text } = renderEmail({
    appUrl: APP_URL,
    subject,
    blocks: template.body(data),
    cta: template.cta ? template.cta(data) : null,
    isMarketing: template.category === "marketing",
    unsubscribeUrl,
  });

  const baseRow = {
    recipient_email: to,
    recipient_user_id: recipientUserId,
    template_key: template.key,
    category: template.category,
    trigger_event: triggerEvent.slice(0, 120),
    related_table: body.relatedTable ? String(body.relatedTable).slice(0, 80) : null,
    related_id: relatedId,
    subject,
    idempotency_key: idempotencyKey,
  };

  if (suppressedReason) {
    const { data: row } = await admin
      .from("email_log")
      .insert({ ...baseRow, status: "suppressed", suppressed_reason: suppressedReason })
      .select("id")
      .maybeSingle();
    return json({ ok: true, sent: false, suppressed: true, reason: suppressedReason, logId: row?.id ?? null });
  }

  const { data: queued, error: queueErr } = await admin
    .from("email_log")
    .insert({ ...baseRow, status: "queued" })
    .select("id")
    .maybeSingle();
  if (queueErr) return json({ error: "Could not log the email." }, 500);
  const logId = queued?.id as string | undefined;

  // --- Transmit, with a capped retry on transient failure.
  const gatewayKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
  let attempts = 0;
  let lastError = "";
  let providerId: string | null = null;
  let permanent = false;

  while (attempts < MAX_ATTEMPTS && !providerId && !permanent) {
    attempts += 1;
    try {
      const res = await fetch("https://email.lovable.dev/v1/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gatewayKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "STRAND <no-reply@mystrand.co.uk>",
          to: [to],
          subject,
          html,
          text,
        }),
      });
      if (res.ok) {
        const payload = await res.json().catch(() => ({}));
        providerId = String(payload?.id ?? payload?.message_id ?? "accepted");
      } else {
        lastError = `${res.status} ${(await res.text()).slice(0, 400)}`;
        // 4xx other than 429 is permanent — do not burn retries.
        permanent = res.status !== 429 && res.status < 500;
        if (!permanent) await sleep(attempts * 800);
      }
    } catch (e) {
      lastError = String(e).slice(0, 400);
      await sleep(attempts * 800);
    }
  }

  if (logId) {
    await admin
      .from("email_log")
      .update(
        providerId
          ? { status: "sent", attempts, provider_message_id: providerId, sent_at: new Date().toISOString(), error: null }
          : { status: "failed", attempts, error: lastError || "Unknown send failure" },
      )
      .eq("id", logId);
  }

  return providerId
    ? json({ ok: true, sent: true, logId })
    : json({ ok: false, sent: false, logId, error: lastError }, 502);
});
