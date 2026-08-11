// Notifies a brand when it is tagged on a member's record (treatment plan,
// wash day, style record, glossary entry).
//
// Privacy contract: the brand is told THAT it was credited and on what kind of
// surface — never who tagged it, and never any detail of the record. Same rule
// as the brand-facing credits screen.
//
// Fire-and-forget: always returns 200 so a failed notification can never break
// the tagging action that triggered it.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dispatchEmail, serviceClient } from "../_shared/app-email/core.ts";
import { requireServiceOrAuthedUser } from "../_shared/auth.ts";

const SURFACE_LABEL: Record<string, string> = {
  treatment_plan: "a member's treatment plan",
  treatment_plan_product: "a product on a member's treatment plan",
  wash_day: "a member's wash day",
  style_entry: "a member's style record",
  glossary_term: "an ingredient glossary entry",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { tag_id } = await req.json().catch(() => ({}));
    if (!tag_id) return json({ ok: false, reason: "missing tag_id" });

    const admin = serviceClient();

    const { data: tag } = await admin
      .from("brand_tags")
      .select("id, brand_id, taggable_type, created_at")
      .eq("id", tag_id)
      .maybeSingle();

    // No brand_id means the member typed a name that isn't on STRAND — nobody
    // to notify.
    if (!tag?.brand_id) return json({ ok: true, skipped: "no_brand" });

    const { data: brand } = await admin
      .from("brand_profiles")
      .select("user_id, brand_name")
      .eq("id", tag.brand_id)
      .maybeSingle();
    if (!brand?.user_id) return json({ ok: true, skipped: "no_brand_user" });

    const surface = SURFACE_LABEL[tag.taggable_type] ?? "a member's record";

    // In-app notification. Deliberately no entity_id: the brand must not be
    // able to deep link into a member's record.
    await admin.from("notifications").insert({
      user_id: brand.user_id,
      kind: "brand_tagged",
      entity_type: "brand_tag",
      url: "/brand/tags",
      title: "Your brand was credited",
      body: `Your brand has been tagged on ${surface}.`,
    });

    const { data: userRes } = await admin.auth.admin.getUserById(brand.user_id);
    const email = userRes?.user?.email;
    if (!email) return json({ ok: true, skipped: "no_email" });

    const result = await dispatchEmail(
      {
        templateKey: "brand-tagged",
        to: email,
        recipientUserId: brand.user_id,
        triggerEvent: "brand_tag.created",
        relatedTable: "brand_tags",
        relatedId: String(tag.id),
        idempotencyKey: `brand-tagged:${tag.id}`,
        data: { brand_name: brand.brand_name ?? "there", surface },
      },
      admin,
    );

    if (!result.sent) console.warn("notify-brand-tag: not sent", JSON.stringify(result));
    return json({ ok: true, ...result });
  } catch (err) {
    console.error("notify-brand-tag error", err);
    return json({ ok: true, error: String(err) });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
