// Notifies STRAND admins when a new member, professional or brand registers.
// Identity is taken from the caller's JWT — never from the request body — so
// this can never be used to fabricate sign-up alerts.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dispatchEmail, serviceClient } from "../_shared/app-email/core.ts";
import { resolveAdminEmails } from "../_shared/app-email/admins.ts";
import { requireServiceOrAuthedUser } from "../_shared/auth.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const KINDS: Record<string, { label: string; path: string; cta: string }> = {
  member: { label: "member", path: "/admin/members", cta: "View members" },
  professional: {
    label: "professional",
    path: "/admin/applications",
    cta: "View applications",
  },
  brand: { label: "brand", path: "/admin/brands", cta: "View brands" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await requireServiceOrAuthedUser(req);
  if (caller instanceof Response) return caller;

  try {
    const body = await req.json().catch(() => ({}));
    const kind = KINDS[String(body?.kind ?? "").trim()];
    if (!kind) return json({ ok: false, error: "Unknown kind." }, 400);

    const admin = serviceClient();

    // Prefer the authenticated caller's own identity.
    const userId = caller?.user?.id ?? (typeof body?.userId === "string" ? body.userId : null);
    const email =
      caller?.user?.email ?? (typeof body?.email === "string" ? body.email : "") ?? "";
    const name =
      (typeof body?.name === "string" && body.name.trim()) ||
      (caller?.user?.user_metadata?.display_name as string | undefined) ||
      String(email).split("@")[0] ||
      "Unknown";

    const recipients = await resolveAdminEmails(admin);
    if (recipients.length === 0) return json({ ok: true, skipped: "no_recipients" });

    const result = await dispatchEmail(
      {
        templateKey: "admin-signup-received",
        to: recipients,
        triggerEvent: `signup.${kind.label}`,
        relatedTable: "profiles",
        relatedId: userId,
        idempotencyKey: userId ? `admin-signup-received:${kind.label}:${userId}` : null,
        data: {
          kindLabel: kind.label,
          path: kind.path,
          ctaLabel: kind.cta,
          name,
          email,
          note: typeof body?.note === "string" ? body.note : "",
          registered: new Date().toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        },
      },
      admin,
    );

    if (!result.sent) console.warn("notify-admin-signup: not sent", JSON.stringify(result));
    return json({ ok: true, ...result, recipients: recipients.length });
  } catch (err) {
    console.error("notify-admin-signup error", err);
    // Fire-and-forget: never break the sign-up it is reporting on.
    return json({ ok: true, error: String(err) });
  }
});
