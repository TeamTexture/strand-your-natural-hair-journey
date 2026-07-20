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
  name: "add_product",
  title: "Add product to shelf or wishlist",
  description:
    "Add a product for the signed-in user. Defaults to the shelf; set `destination` to 'wishlist' to save it for later. Ingredient analysis happens later inside the app.",
  inputSchema: {
    name: z.string().trim().min(1).describe("Product name, e.g. 'Ultimate Moisture Hair Mask'."),
    brand: z.string().trim().optional().describe("Brand name, e.g. 'Lola'."),
    category: z.string().trim().optional().describe("Product category, e.g. 'mask', 'shampoo'."),
    source_url: z.string().url().optional().describe("Product page URL, if known."),
    ingredients: z.array(z.string()).optional().describe("Ingredient list if already known."),
    destination: z.enum(["shelf", "wishlist"]).optional().describe("Where to save it. Default 'shelf'."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      if (!ctx.isAuthenticated())
        return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
      const sb = supabaseForUser(ctx);
      const toShelf = (input.destination ?? "shelf") === "shelf";
      const enriched = await enrichProduct({
        name: input.name,
        brand: input.brand,
        source_url: input.source_url,
      });
      const { data, error } = await sb
        .from("user_products")
        .insert({
          user_id: ctx.getUserId(),
          name: input.name,
          brand: input.brand ?? null,
          category: input.category ?? null,
          source_url: enriched.source_url ?? input.source_url ?? null,
          image_url: enriched.image_url ?? null,
          ingredients: input.ingredients ?? [],
          product_key: keyOf(input.brand, input.name),
          on_shelf: toShelf,
          on_wishlist: !toShelf,
          added_to_shelf_at: toShelf ? new Date().toISOString() : null,
        })
        .select("id, name, brand, image_url, source_url, on_shelf, on_wishlist")
        .single();
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return {
        content: [
          {
            type: "text",
            text: `Added ${data.brand ? data.brand + " " : ""}${data.name} to ${toShelf ? "shelf" : "wishlist"}.`,
          },
        ],
        structuredContent: { product: data },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
    }
  },
});
