// AI COST METER — Phase 2 instrumentation. Observation only: this module
// never changes a prompt, a model, a guardrail or a byte of user-facing copy.
//
// One row in `public.ai_call_log` per AI call, whichever provider served it:
//   provider = 'anthropic'        → direct Anthropic API (Claude)
//   provider = 'lovable_gateway'  → Lovable AI Gateway (Gemini)
//
// `model` is recorded verbatim as used. Cost is NOT computed here — the
// `ai_call_costs` view joins `ai_model_rates`, and leaves cost null where no
// authoritative price is on file (honest gaps, never invented numbers).
//
// `stage` separates the two-stage pipeline:
//   1 = evidence gathering / verification / fidelity helper calls
//   2 = the writer call whose output the member would see
//
// `model_called` distinguishes a paid call from a guardrail row logged on a
// cached read path (sanitiseAndLog firing without any model call). Phase 4's
// rejection rate must be computed over `model_called = true` rows only.
//
// Stage-2 rows are BUFFERED until the guardrails have run, so a single row can
// carry both the token cost and the outcome (completed / rejected + rule).
// sanitiseAndLog flushes the buffer. If a buffered call is never flushed (an
// error path, or a function that doesn't sanitise), the next call flushes it
// with outcome 'unflushed' so no call is silently lost.

declare const Deno: { env: { get(key: string): string | undefined } };

export type AiProviderName = "anthropic" | "lovable_gateway";

export interface AiCallRow {
  function_name: string;
  surface?: string | null;
  stage?: 1 | 2;
  provider: AiProviderName;
  model: string;
  model_called?: boolean;
  outcome?: "completed" | "rejected" | "error" | "unflushed";
  rejection_rule?: string | null;
  user_id?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
  duration_ms?: number | null;
  http_status?: number | null;
  error_text?: string | null;
  generation_id?: string | null;
  attempt_number?: number | null;
  max_attempts?: number | null;
  retry_reason?: string | null;
  is_impersonated?: boolean | null;
  impersonated_by?: string | null;
}

// ---------------------------------------------------------------------------
// AMBIENT MEMBER ATTRIBUTION (2026-08-26 incident)
// ---------------------------------------------------------------------------
// Every surface built its meter metadata from a module-level `AI_METER_META`
// constant that carries no user id, and almost no call site threaded `userId`
// into sanitiseAndLog. The result: `ai_call_log.user_id` was null on nearly
// every row, so a rejection could not be traced to the member it broke.
//
// `requireAuthedUser` now sets the ambient id the moment a request is
// authenticated, and every row falls back to it. An EXPLICIT user_id on the row
// always wins, so a function that threads the id through is unaffected.
//
// Isolate reuse caveat: one isolate can serve concurrent requests, so the
// ambient value is a best-effort attribution, not an audit-grade one. The
// surfaces that matter for triage also pass `userId` explicitly, which takes
// precedence. Never use the ambient id for an authorisation decision — it is a
// logging convenience only.
let ambientUserId: string | null = null;
let ambientIsImpersonated = false;
let ambientImpersonatedBy: string | null = null;

/** Set the member the current request belongs to. Called from requireAuthedUser. */
export function setAiCallUser(userId: string | null | undefined): void {
  ambientUserId = userId ?? null;
}

/** The ambient member id, where one has been established for this request. */
export function getAiCallUser(): string | null {
  return ambientUserId;
}

/** Mark all meter rows from this request as admin impersonation telemetry. */
export function setAiCallImpersonation(args: {
  isImpersonated?: boolean | null;
  impersonatedBy?: string | null;
} | null | undefined): void {
  ambientIsImpersonated = !!args?.isImpersonated;
  ambientImpersonatedBy = args?.impersonatedBy ?? null;
}



async function insertRows(rows: AiCallRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return;
    // @ts-ignore — esm.sh URL import is Deno-native.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from("ai_call_log").insert(
      rows.map((r) => ({
        function_name: r.function_name,
        surface: r.surface ?? null,
        stage: r.stage ?? 2,
        provider: r.provider,
        model: r.model,
        model_called: r.model_called ?? true,
        outcome: r.outcome ?? "completed",
        rejection_rule: r.rejection_rule ?? null,
        user_id: r.user_id ?? ambientUserId ?? null,
        input_tokens: r.input_tokens ?? null,
        output_tokens: r.output_tokens ?? null,
        cache_read_tokens: r.cache_read_tokens ?? null,
        cache_write_tokens: r.cache_write_tokens ?? null,
        duration_ms: r.duration_ms ?? null,
        http_status: r.http_status ?? null,
        error_text: r.error_text ? String(r.error_text).slice(0, 500) : null,
        generation_id: r.generation_id ?? null,
        attempt_number: r.attempt_number ?? null,
        max_attempts: r.max_attempts ?? null,
        retry_reason: r.retry_reason ? String(r.retry_reason).slice(0, 300) : null,
        is_impersonated: r.is_impersonated ?? ambientIsImpersonated,
        impersonated_by: r.impersonated_by ?? ambientImpersonatedBy,
      })),
    );
  } catch (e) {
    // Best-effort: metering must never break a member's request.
    console.warn("[ai-meter] log write failed:", e);
  }
}

/** Buffered stage-2 writer calls awaiting their guardrail outcome.
 *  Keyed by function + generation id so bounded retries can log every attempt
 *  separately, while parallel split calls within one attempt share an outcome. */
const pending = new Map<string, AiCallRow[]>();

const pendingKey = (functionName: string, generationId?: string | null) =>
  `${functionName}:${generationId ?? "legacy"}`;

const rowKey = (row: AiCallRow) => pendingKey(row.function_name, row.generation_id);

/** Token usage of the writer call still buffered for `functionName`, so the
 *  evidence-set audit row can record what stage 2 actually cost. Read-only —
 *  the row is still flushed by recordAiOutcome / recordAiFailure. */
export function getBufferedUsage(
  functionName: string,
): { input: number; output: number; total: number } | null {
  const rows = [...pending.entries()]
    .filter(([key]) => key.startsWith(`${functionName}:`))
    .flatMap(([, value]) => value);
  if (rows.length === 0) return null;
  const input = rows.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0);
  const output = rows.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0);
  return { input, output, total: input + output };
}

function flush(row: AiCallRow): void {
  void insertRows([row]);
}


/** Record an AI call. Stage 1 rows are written immediately; stage-2 rows wait
 *  for `recordAiOutcome` so outcome + rejection rule land on the same row. */
export function logAiCall(row: AiCallRow): void {
  const stage = row.stage ?? 2;
  if (stage === 1 || row.outcome === "error") {
    flush({ ...row, stage });
    return;
  }
  const key = rowKey(row);
  for (const [existingKey, rows] of pending.entries()) {
    if (existingKey.startsWith(`${row.function_name}:`) && existingKey !== key) {
      rows.forEach((stale) => flush({ ...stale, outcome: "unflushed" }));
      pending.delete(existingKey);
    }
  }
  const rows = pending.get(key) ?? [];
  rows.push({ ...row, stage: 2 });
  pending.set(key, rows);
}

/** Called by sanitiseAndLog once the guardrails have run. Attaches the outcome
 *  to the buffered writer row, or — when no model call happened on this path
 *  (a cached read) — logs a `model_called = false` row so the inflated
 *  rejection rate the audit found can be separated out. */
export function recordAiOutcome(args: {
  function_name: string;
  surface?: string | null;
  user_id?: string | null;
  outcome: "completed" | "rejected";
  rejection_rule?: string | null;
  generation_id?: string | null;
  attempt_number?: number | null;
  max_attempts?: number | null;
  retry_reason?: string | null;
  is_impersonated?: boolean | null;
  impersonated_by?: string | null;
}): void {
  const key = pendingKey(args.function_name, args.generation_id);
  const buffered = pending.get(key);
  if (buffered && buffered.length > 0) {
    pending.delete(key);
    buffered.forEach((row) => flush({
      ...row,
      surface: row.surface ?? args.surface ?? null,
      user_id: row.user_id ?? args.user_id ?? ambientUserId ?? null,
      outcome: args.outcome,
      rejection_rule: args.rejection_rule ?? null,
      generation_id: row.generation_id ?? args.generation_id ?? null,
      attempt_number: row.attempt_number ?? args.attempt_number ?? null,
      max_attempts: row.max_attempts ?? args.max_attempts ?? null,
      retry_reason: row.retry_reason ?? args.retry_reason ?? null,
      is_impersonated: row.is_impersonated ?? args.is_impersonated ?? ambientIsImpersonated,
      impersonated_by: row.impersonated_by ?? args.impersonated_by ?? ambientImpersonatedBy,
    }));
    return;
  }
  flush({
    function_name: args.function_name,
    surface: args.surface ?? null,
    stage: 2,
    provider: "anthropic",
    model: "none",
    model_called: false,
    outcome: args.outcome,
    rejection_rule: args.rejection_rule ?? null,
    user_id: args.user_id ?? ambientUserId ?? null,
    generation_id: args.generation_id ?? null,
    attempt_number: args.attempt_number ?? null,
    max_attempts: args.max_attempts ?? null,
    retry_reason: args.retry_reason ?? null,
    is_impersonated: args.is_impersonated ?? ambientIsImpersonated,
    impersonated_by: args.impersonated_by ?? ambientImpersonatedBy,
  });
}

/** Attach a POST-MODEL failure (unparsable JSON, truncated output, nothing left
 *  after normalisation) to the buffered writer row. Without this the gateway
 *  call logs as `completed` and a parse failure is indistinguishable from a
 *  genuine success — which is exactly how the wash-day-steps failure of
 *  2026-08-26 hid itself. */
export function recordAiFailure(args: {
  function_name: string;
  surface?: string | null;
  user_id?: string | null;
  error_text: string;
  rejection_rule?: string | null;
  generation_id?: string | null;
  attempt_number?: number | null;
  max_attempts?: number | null;
  retry_reason?: string | null;
  is_impersonated?: boolean | null;
  impersonated_by?: string | null;
}): void {
  const key = pendingKey(args.function_name, args.generation_id);
  const buffered = pending.get(key);
  if (buffered) pending.delete(key);
  const rows = buffered && buffered.length > 0
    ? buffered
    : [{
      function_name: args.function_name,
      stage: 2,
      provider: "lovable_gateway",
      model: "unknown",
      model_called: true,
    } as AiCallRow];
  rows.forEach((row) => flush({
    ...row,
    surface: row.surface ?? args.surface ?? null,
    user_id: row.user_id ?? args.user_id ?? ambientUserId ?? null,
    outcome: "error",
    rejection_rule: args.rejection_rule ?? "post_model_parse_failure",
    error_text: args.error_text,
    generation_id: row.generation_id ?? args.generation_id ?? null,
    attempt_number: row.attempt_number ?? args.attempt_number ?? null,
    max_attempts: row.max_attempts ?? args.max_attempts ?? null,
    retry_reason: row.retry_reason ?? args.retry_reason ?? null,
    is_impersonated: row.is_impersonated ?? args.is_impersonated ?? ambientIsImpersonated,
    impersonated_by: row.impersonated_by ?? args.impersonated_by ?? ambientImpersonatedBy,
  }));
}

/** Metadata a call site passes so a row can be attributed. */
export interface AiCallMeta {
  function_name: string;
  stage?: 1 | 2;
  surface?: string | null;
  user_id?: string | null;
  generation_id?: string | null;
  attempt_number?: number | null;
  max_attempts?: number | null;
  retry_reason?: string | null;
  is_impersonated?: boolean | null;
  impersonated_by?: string | null;
}

interface GatewayUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

/**
 * Drop-in wrapper for a Lovable AI Gateway chat-completions POST. Same
 * behaviour and same Response as a direct `fetch` — it only reads a clone of
 * the body to harvest `usage` and the model string, then logs a row.
 */
export async function gatewayFetch(
  meta: AiCallMeta,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const t0 = Date.now();
  let requestedModel = "unknown";
  try {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    if (body && typeof body.model === "string") requestedModel = body.model;
  } catch { /* body not JSON — keep 'unknown' */ }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    logAiCall({
      ...meta,
      provider: "lovable_gateway",
      model: requestedModel,
      outcome: "error",
      duration_ms: Date.now() - t0,
      error_text: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }

  const duration_ms = Date.now() - t0;
  if (!res.ok) {
    logAiCall({
      ...meta,
      provider: "lovable_gateway",
      model: requestedModel,
      outcome: "error",
      http_status: res.status,
      duration_ms,
    });
    return res;
  }

  try {
    const peek = await res.clone().json();
    const usage = (peek?.usage ?? {}) as GatewayUsage;
    logAiCall({
      ...meta,
      provider: "lovable_gateway",
      model: typeof peek?.model === "string" && peek.model ? peek.model : requestedModel,
      http_status: res.status,
      duration_ms,
      input_tokens: usage.prompt_tokens ?? null,
      output_tokens: usage.completion_tokens ?? null,
      cache_read_tokens: usage.prompt_tokens_details?.cached_tokens ?? null,
    });
  } catch {
    logAiCall({
      ...meta,
      provider: "lovable_gateway",
      model: requestedModel,
      http_status: res.status,
      duration_ms,
    });
  }
  return res;
}
