/**
 * THE SINGLE SEND PATH. Every email in STRAND is transmitted from here.
 *
 * Other edge functions import `dispatchEmail` directly; browser code calls the
 * `send-app-email` function, which is a thin HTTP wrapper over this file.
 * Nothing else may talk to Resend.
 *
 * Guarantees:
 *  - Every attempt is written to public.email_log (queued -> sent | failed |
 *    suppressed). No fire-and-forget, no silent failures.
 *  - Idempotency keys stop retries duplicating a send.
 *  - Marketing needs explicit consent; optional transactional emails respect
 *    the recipient's preference switches; essential emails always send.
 *  - The global flag gates NEW emails only. Templates marked `legacy: true`
 *    (the emails already sending in production today) bypass it so nothing
 *    that works now breaks.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { getTemplate, type EmailTemplate } from "./templates.ts";
import { renderEmail } from "./render.ts";
import { APP_BASE_URL, FROM_NOREPLY, FROM_NOTIFICATIONS } from "./config.ts";

const MAX_ATTEMPTS = 3;
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface DispatchInput {
  templateKey: string;
  /** One recipient, or several for internal admin fan-out. */
  to: string | string[];
  recipientUserId?: string | null;
  triggerEvent?: string | null;
  relatedTable?: string | null;
  relatedId?: string | null;
  idempotencyKey?: string | null;
  data?: Record<string, unknown>;
  /** Overrides the template's default sender identity. */
  from?: string | null;
  /** Reply-To address, e.g. forwarding an enquiry back to the member. */
  replyTo?: string | null;

}

export interface DispatchResult {
  ok: boolean;
  sent: boolean;
  suppressed?: boolean;
  reason?: string;
  deduped?: boolean;
  logId?: string | null;
  error?: string;
  status?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const validEmail = (v: string) =>
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) && v.length <= 254;

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
}

/**
 * Send clearance, read from `platform_settings` in one round trip.
 *
 * Two independent switches, because "all emails off" and "this email is live"
 * are different decisions:
 *   - `email_sending_enabled` (boolean) — the master switch. True = everything.
 *   - `email_templates_enabled` (array of template keys) — the per-template
 *     allowlist used while the platform is still switched off overall, so a
 *     feature can go live without also releasing every hourly reminder and
 *     digest that shares the master switch.
 * `legacy` templates bypass both (see EmailTemplate.legacy).
 */
async function sendClearance(
  admin: SupabaseClient,
): Promise<{ globalOn: boolean; enabledKeys: Set<string> }> {
  const { data } = await admin
    .from("platform_settings")
    .select("key,value")
    .in("key", ["email_sending_enabled", "email_templates_enabled"]);
  const rows = (data ?? []) as { key: string; value: unknown }[];
  const globalOn = rows.find((r) => r.key === "email_sending_enabled")?.value === true;
  const list = rows.find((r) => r.key === "email_templates_enabled")?.value;
  const enabledKeys = new Set<string>(
    Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [],
  );
  return { globalOn, enabledKeys };
}


async function transmit(
  payload: Record<string, unknown>,
): Promise<{ id: string | null; error: string; permanent: boolean; status: number }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    return { id: null, error: "RESEND_API_KEY is not configured", permanent: true, status: 0 };
  }
  let attempt = 0;
  let error = "";
  let status = 0;
  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      status = res.status;
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          id: String((body as { id?: string })?.id ?? "accepted"),
          error: "",
          permanent: false,
          status,
        };
      }
      error = `${res.status} ${(await res.text()).slice(0, 500)}`;
      // Anything 4xx except 429 is a permanent rejection — do not burn retries.
      if (res.status !== 429 && res.status < 500) {
        return { id: null, error, permanent: true, status };
      }
      await sleep(attempt * 700);
    } catch (e) {
      error = String(e).slice(0, 500);
      await sleep(attempt * 700);
    }
  }
  return { id: null, error: error || "Unknown send failure", permanent: false, status };
}

/** Minutes to wait before attempt N+1. Spans a Resend daily-quota reset. */
const BACKOFF_MINUTES = [5, 45, 240, 720];

function retryAt(attemptNo: number, maxAttempts: number, permanent: boolean): string | null {
  if (permanent) return null;
  if (attemptNo >= maxAttempts) return null;
  const mins = BACKOFF_MINUTES[Math.min(attemptNo, BACKOFF_MINUTES.length) - 1] ?? 720;
  return new Date(Date.now() + mins * 60_000).toISOString();
}

function defaultFrom(template: EmailTemplate): string {
  return template.sender === "noreply" ? FROM_NOREPLY : FROM_NOTIFICATIONS;
}

export async function dispatchEmail(
  input: DispatchInput,
  client?: SupabaseClient,
): Promise<DispatchResult> {
  const admin = client ?? serviceClient();

  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((r) => String(r ?? "").trim().toLowerCase())
    .filter((r) => validEmail(r));
  if (recipients.length === 0) {
    return { ok: false, sent: false, error: "No valid recipient email." };
  }

  const template = getTemplate(input.templateKey);
  if (!template) {
    return { ok: false, sent: false, error: `Unknown template: ${input.templateKey}` };
  }

  const data = (input.data && typeof input.data === "object" ? input.data : {}) as Record<
    string,
    unknown
  >;
  const recipientUserId = input.recipientUserId || null;
  const idempotencyKey = input.idempotencyKey?.trim()?.slice(0, 200) || null;
  const triggerEvent = (input.triggerEvent || template.key).slice(0, 120);

  // --- Idempotency.
  //
  // A row only proves "already handled" when it reached a terminal, non-failed
  // state. A `failed` row proves the OPPOSITE — the member never got the email.
  // Treating those as deduped is what silently swallowed 31 sends when Resend
  // returned 429 daily_quota_exceeded on 24 Aug 2026: every later attempt saw
  // the failed row and returned "deduped" without sending anything.
  let retryLogId: string | null = null;
  let priorAttempts = 0;
  if (idempotencyKey) {
    const { data: existing } = await admin
      .from("email_log")
      .select("id,status,attempts")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    const row = existing as { id: string; status: string; attempts: number | null } | null;
    if (row && row.status !== "failed") {
      return { ok: true, sent: false, deduped: true, logId: row.id };
    }
    if (row) {
      retryLogId = row.id;
      priorAttempts = row.attempts ?? 0;
    }
  }

  const subject = template.subject(data).slice(0, 200);

  // --- Consent / preference gate.
  let prefs: Record<string, unknown> | null = null;
  if (recipientUserId) {
    const { data: p } = await admin
      .from("email_preferences")
      .select("*")
      .eq("user_id", recipientUserId)
      .maybeSingle();
    prefs = (p as Record<string, unknown> | null) ?? null;
  }

  let suppressedReason: string | null = null;
  if (template.category === "marketing") {
    if (!prefs || prefs.marketing_consent !== true) suppressedReason = "no_marketing_consent";
  } else if (!template.essential && template.preference && prefs) {
    if (prefs[template.preference] === false) {
      suppressedReason = `preference_off:${template.preference}`;
    }
  }

  // --- Send clearance. Legacy (already-live) templates are exempt; otherwise
  // the master switch OR the per-template allowlist has to clear it.
  if (!suppressedReason && !template.legacy) {
    const { globalOn, enabledKeys } = await sendClearance(admin);
    if (!globalOn && !enabledKeys.has(template.key)) suppressedReason = "global_flag_off";
  }


  const unsubscribeUrl =
    template.category === "marketing" && prefs?.unsubscribe_token
      ? `${APP_BASE_URL}/email-preferences?unsubscribe=${prefs.unsubscribe_token}`
      : null;

  const { html, text } = renderEmail({
    subject,
    eyebrow: template.eyebrow ?? null,
    blocks: template.body(data),
    rows: template.rows ? template.rows(data) : null,
    cta: template.cta ? template.cta(data) : null,
    isMarketing: template.category === "marketing",
    unsubscribeUrl,
    footerNote: template.footerNote ?? null,
  });

  const baseRow = {
    recipient_email: recipients.join(", ").slice(0, 500),
    recipient_user_id: recipientUserId,
    template_key: template.key,
    category: template.category,
    trigger_event: triggerEvent,
    related_table: input.relatedTable ? String(input.relatedTable).slice(0, 80) : null,
    related_id: input.relatedId || null,
    subject,
    idempotency_key: idempotencyKey,
    // The exact input this email was built from, so a failed send can be
    // re-driven later by the retry sweep without its trigger firing again.
    payload: {
      templateKey: template.key,
      to: recipients,
      recipientUserId,
      triggerEvent,
      relatedTable: input.relatedTable ?? null,
      relatedId: input.relatedId ?? null,
      idempotencyKey,
      data,
      from: input.from ?? null,
      replyTo: input.replyTo ?? null,
    },
  };

  if (suppressedReason) {
    const { data: row } = await admin
      .from("email_log")
      .insert({ ...baseRow, status: "suppressed", suppressed_reason: suppressedReason })
      .select("id")
      .maybeSingle();
    return {
      ok: true,
      sent: false,
      suppressed: true,
      reason: suppressedReason,
      logId: (row?.id as string) ?? null,
    };
  }

  const attemptNo = priorAttempts + 1;
  const { data: queued, error: logErr } = retryLogId
    ? await admin
        .from("email_log")
        .update({
          ...baseRow,
          status: "queued",
          attempts: attemptNo,
          next_attempt_at: null,
          error: null,
        })
        .eq("id", retryLogId)
        .select("id")
        .maybeSingle()
    : await admin
        .from("email_log")
        .insert({ ...baseRow, status: "queued", attempts: attemptNo })
        .select("id")
        .maybeSingle();
  if (logErr) {
    // Logging is not optional — an unprovable send is worse than a late one.
    return { ok: false, sent: false, error: `email_log insert failed: ${logErr.message}` };
  }
  const logId = (queued?.id as string) ?? retryLogId;

  const maxAttempts = 4;
  const result = await transmit({
    from: input.from || defaultFrom(template),
    ...(input.replyTo && validEmail(input.replyTo)
      ? { reply_to: input.replyTo.toLowerCase() }
      : {}),

    to: recipients,
    subject,
    html,
    text,
  });

  if (logId) {
    await admin
      .from("email_log")
      .update(
        result.id
          ? {
              status: "sent",
              provider_message_id: result.id,
              sent_at: new Date().toISOString(),
              error: null,
            }
          : {
              status: "failed",
              error: result.error,
              // Backoff across invocations, not just inside this one. A
              // permanent rejection (bad address, unknown template) is never
              // retried; a quota/transient failure is, until max_attempts.
              next_attempt_at: retryAt(attemptNo, maxAttempts, result.permanent),
            },
      )
      .eq("id", logId);
  }

  return result.id
    ? { ok: true, sent: true, logId }
    : { ok: false, sent: false, logId, error: result.error, status: result.status };
}
