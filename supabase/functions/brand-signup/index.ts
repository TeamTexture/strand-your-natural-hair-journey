// Grants the 'brand' role and creates/updates a brand_profiles row for the
// authenticated caller. Uses service role because user_roles is not writeable
// from the client. Idempotent — safe to call more than once.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await anon.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const brandName = (body.brand_name ?? "").toString().trim();
    const contactName = (body.contact_name ?? "").toString().trim() || null;
    const website = (body.website ?? "").toString().trim() || null;
    const category = (body.category ?? "").toString().trim() || null;
    if (!brandName) {
      return new Response(JSON.stringify({ error: "brand_name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Upsert brand profile
    const { data: existing } = await admin
      .from("brand_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      await admin.from("brand_profiles")
        .update({ brand_name: brandName, contact_name: contactName, website, category })
        .eq("user_id", userId);
    } else {
      await admin.from("brand_profiles").insert({
        user_id: userId,
        brand_name: brandName,
        contact_name: contactName,
        website,
        category,
      });
    }

    // Grant brand role (idempotent)
    await admin.from("user_roles").upsert(
      { user_id: userId, role: "brand" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );

    // Brand-only accounts don't need the auto-assigned consumer role — it
    // otherwise pushes them through the consumer paywall on /home. Users
    // who also want the consumer app can add that role separately later.
    await admin.from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "consumer");

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("brand-signup error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
