import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Kind = "all" | "product" | "tool";

const clean = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(clean).filter(Boolean) as string[])).slice(0, 20);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: authError } = await anon.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (authError || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await anon
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["brand", "admin"]);
    if (!roles?.length) {
      return new Response(JSON.stringify({ error: "Brand access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const kind: Kind = body?._kind === "product" || body?._kind === "tool" ? body._kind : "all";
    const search = clean(body?._search)?.toLowerCase() ?? null;
    const limit = Math.min(Math.max(Number(body?._limit) || 80, 1), 100);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const items: Array<{
      kind: "product" | "tool";
      source_id: string;
      name: string;
      brand: string | null;
      category: string | null;
      image_url: string | null;
      ingredients: string[];
      tool_kind: string | null;
      key_features: string[];
      materials: string[];
      source_url: string | null;
      user_count: number;
    }> = [];

    if (kind !== "tool") {
      const { data, error } = await admin
        .from("user_products")
        .select("id,name,brand,category,image_url,ingredients,source_url,user_id")
        .not("name", "is", null)
        .limit(500);
      if (error) throw error;
      for (const row of data ?? []) {
        const name = clean(row.name);
        if (!name) continue;
        items.push({
          kind: "product",
          source_id: row.id,
          name,
          brand: clean(row.brand),
          category: clean(row.category),
          image_url: clean(row.image_url),
          ingredients: toStringArray(row.ingredients),
          tool_kind: null,
          key_features: [],
          materials: [],
          source_url: clean(row.source_url),
          user_count: row.user_id ? 1 : 0,
        });
      }
    }

    if (kind !== "product") {
      const { data, error } = await admin
        .from("user_tools")
        .select("id,name,brand,category,image_url,source_url,user_id")
        .not("name", "is", null)
        .limit(500);
      if (error) throw error;
      for (const row of data ?? []) {
        const name = clean(row.name);
        if (!name) continue;
        items.push({
          kind: "tool",
          source_id: row.id,
          name,
          brand: clean(row.brand),
          category: clean(row.category),
          image_url: clean(row.image_url),
          ingredients: [],
          tool_kind: clean(row.category),
          key_features: clean(row.category) ? [clean(row.category)!] : [],
          materials: [],
          source_url: clean(row.source_url),
          user_count: row.user_id ? 1 : 0,
        });
      }
    }

    const grouped = new Map<string, typeof items[number]>();
    for (const item of items) {
      const haystack = [item.name, item.brand, item.category].filter(Boolean).join(" ").toLowerCase();
      if (search && !haystack.includes(search)) continue;
      const key = `${item.kind}:${item.name.toLowerCase()}:${item.brand?.toLowerCase() ?? ""}`;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, item);
        continue;
      }
      current.user_count += item.user_count;
      if (!current.image_url && item.image_url) current.image_url = item.image_url;
      if (!current.source_url && item.source_url) current.source_url = item.source_url;
      current.ingredients = Array.from(new Set([...current.ingredients, ...item.ingredients])).slice(0, 20);
      current.key_features = Array.from(new Set([...current.key_features, ...item.key_features])).slice(0, 10);
    }

    const catalogue = Array.from(grouped.values())
      .sort((a, b) => b.user_count - a.user_count || a.name.localeCompare(b.name))
      .slice(0, limit);

    return new Response(JSON.stringify({ items: catalogue }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});