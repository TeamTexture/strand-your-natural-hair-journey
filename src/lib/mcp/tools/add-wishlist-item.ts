import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { enrichProduct } from "../_enrich";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function keyOf(brand: string | undefined, name: string) {
  return `${(brand ?? "").trim().toLowerCase()}::${name.trim().toLowerCase()}`;
}

export default defineTool({
  name: "add_wishlist_item",
  title: "Add wishlist item",
  description:
    "Add a product to the signed-in user's wishlist (stored in `user_products` with on_wishlist=true). The `reason` is saved into `ai_summary` so the user sees why you recommended it.",
  inputSchema: {
    name: z.string().trim().min(1).describe("Product name."),
    brand: z.string().trim().optional().describe("Brand name."),
    category: z.string().trim().optional().describe("Category, e.g. 'leave-in', 'oil', 'mask', 'supplement'."),
    reason: z.string().trim().optional().describe("Why this is recommended for the user."),
    priority: z.number().int().optional().describe("Optional priority ranking; stored as match_score."),
    source_url: z.string().url().optional().describe("Product page URL if known — used to pull the thumbnail image."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      if (!ctx.isAuthenticated())
        return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
      const sb = supabaseForUser(ctx);
      const product_key = keyOf(input.brand, input.name);

      const enriched = await enrichProduct({
        name: input.name,
        brand: input.brand,
        source_url: input.source_url,
      });

      // If a row already exists for this product_key (e.g. previously on shelf), flip on_wishlist true.
      const { data: existing } = await sb
        .from("user_products")
        .select("id, on_wishlist, on_shelf, image_url, source_url")
        .eq("user_id", ctx.getUserId())
        .eq("product_key", product_key)
        .maybeSingle();

      if (existing) {
        const { data, error } = await sb
          .from("user_products")
          .update({
            on_wishlist: true,
            ai_summary: input.reason ?? undefined,
            match_score: input.priority ?? undefined,
            category: input.category ?? undefined,
            // Only fill image/url if the existing row has none — never overwrite in-app captures.
            image_url: existing.image_url ?? enriched.image_url ?? undefined,
            source_url: existing.source_url ?? enriched.source_url ?? undefined,
          })
          .eq("id", existing.id)
          .select("id, name, brand, image_url, source_url, on_wishlist, on_shelf")
          .single();
        if (error) return { content: [{ type: "text", text: error.message }], isError: true };
        return {
          content: [{ type: "text", text: `Updated wishlist entry for ${data.brand ? data.brand + " " : ""}${data.name}.` }],
          structuredContent: { item: data },
        };
      }

      const { data, error } = await sb
        .from("user_products")
        .insert({
          user_id: ctx.getUserId(),
          name: input.name,
          brand: input.brand ?? null,
          category: input.category ?? null,
          product_key,
          on_wishlist: true,
          on_shelf: false,
          ai_summary: input.reason ?? null,
          match_score: input.priority ?? null,
          image_url: enriched.image_url ?? null,
          source_url: enriched.source_url ?? null,
        })
        .select("id, name, brand, category, ai_summary, match_score, image_url, source_url, on_wishlist")
        .single();
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return {
        content: [{ type: "text", text: `Added ${data.brand ? data.brand + " " : ""}${data.name} to wishlist.` }],
        structuredContent: { item: data },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
    }
  },
});
