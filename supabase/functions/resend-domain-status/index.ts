// TEMPORARY diagnostic — reports Resend domain verification status. Delete after use.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ ok: false, error: "no_key" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });
  const raw = await res.text();
  const body = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
  const domains = (body?.data ?? []).map((d: Record<string, unknown>) => ({
    name: d.name,
    status: d.status,
    region: d.region,
  }));
  return new Response(JSON.stringify({ status: res.status, domains, raw: raw.slice(0, 400) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
