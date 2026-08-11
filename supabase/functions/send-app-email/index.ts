// HTTP wrapper over the single send path (_shared/app-email/core.ts).
// All composition, gating, logging and transmission live in that shared module
// so browser callers and other edge functions cannot drift apart.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { dispatchEmail } from "../_shared/app-email/core.ts";
import { requireServiceOrAuthedUser } from "../_shared/auth.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Branded transactional email on STRAND's sending domain: never an open
  // relay. Trusted server-to-server callers (service role) or a signed-in
  // member only.
  const caller = await requireServiceOrAuthedUser(req);
  if (caller instanceof Response) return caller;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const templateKey = String(body.templateKey ?? "").trim();
  const to = String(body.to ?? "").trim();
  if (!templateKey) return json({ error: "templateKey is required." }, 400);
  if (!to) return json({ error: "A valid recipient email is required." }, 400);

  try {
    const result = await dispatchEmail({
      templateKey,
      to,
      recipientUserId:
        typeof body.recipientUserId === "string" ? body.recipientUserId : null,
      triggerEvent: typeof body.triggerEvent === "string" ? body.triggerEvent : null,
      relatedTable: typeof body.relatedTable === "string" ? body.relatedTable : null,
      relatedId: typeof body.relatedId === "string" ? body.relatedId : null,
      idempotencyKey:
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : null,
      data: (body.data && typeof body.data === "object"
        ? body.data
        : {}) as Record<string, unknown>,
    });
    if (!result.ok && result.error?.startsWith("Unknown template")) {
      return json(result, 400);
    }
    return json(result, result.ok ? 200 : 502);
  } catch (err) {
    console.error("send-app-email error", err);
    return json({ ok: false, sent: false, error: String(err) }, 500);
  }
});
