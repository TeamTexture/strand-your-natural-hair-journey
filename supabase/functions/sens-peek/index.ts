import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { loadSensitivities } from "../_shared/sensitivities.ts";
import { scanText } from "../_shared/allergen-aliases.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve: (h: (r: Request) => Promise<Response>) => void };

Deno.serve(async (req) => {
  const secret = new URL(req.url).searchParams.get("k");
  if (secret !== "tmp-9f3a7c21-verify") {
    return new Response(JSON.stringify({ error: "no" }), { status: 401 });
  }
  const uid = new URL(req.url).searchParams.get("u")!;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const loaded = await loadSensitivities(sb, uid, "topical");
  const entries = loaded.all;
  const { data: products } = await sb.from("user_products")
    .select("id,name,brand,ingredients,on_shelf,on_wishlist")
    .eq("user_id", uid);
  const avoid = loaded.avoid;
  const flagged = (products ?? []).map((p) => {
    const hits = scanText((p.ingredients ?? []).join(" , "), avoid, "topical");
    return hits.length ? { name: p.name, brand: p.brand, on_shelf: p.on_shelf, hits } : null;
  }).filter(Boolean);
  return new Response(JSON.stringify({ entries: entries.map((e) => ({ code: e.code, label: e.label, severity: e.severity })), productCount: products?.length ?? 0, flagged }, null, 2), { headers: { "content-type": "application/json" } });
});
