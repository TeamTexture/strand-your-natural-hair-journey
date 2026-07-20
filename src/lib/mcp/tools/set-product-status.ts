import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "set_product_status",
  title: "Set product shelf status",
  description:
    "Move a product on/off the shelf, into/out of the wishlist, or favourite it. Pass only the flags you want to change. Use `list_shelf_products` first to get the product id.",
  inputSchema: {
    product_id: z.string().uuid().describe("user_products.id for the product to update."),
    on_shelf: z.boolean().optional(),
    on_wishlist: z.boolean().optional(),
    on_favourite: z.boolean().optional(),
    off_shelf_reason: z.string().optional().describe("Reason when taking a product off the shelf."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      if (!ctx.isAuthenticated())
        return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
      const sb = supabaseForUser(ctx);
      const patch: Record<string, unknown> = {};
      if (input.on_shelf !== undefined) {
        patch.on_shelf = input.on_shelf;
        if (!input.on_shelf) patch.previously_on_shelf = true;
        if (input.on_shelf) patch.added_to_shelf_at = new Date().toISOString();
      }
      if (input.on_wishlist !== undefined) patch.on_wishlist = input.on_wishlist;
      if (input.on_favourite !== undefined) patch.on_favourite = input.on_favourite;
      if (input.off_shelf_reason !== undefined) patch.off_shelf_reason = input.off_shelf_reason;
      if (Object.keys(patch).length === 0)
        return { content: [{ type: "text", text: "No changes provided." }], isError: true };
      const { data, error } = await sb
        .from("user_products")
        .update(patch)
        .eq("id", input.product_id)
        .eq("user_id", ctx.getUserId())
        .select("id, name, brand, on_shelf, on_wishlist, on_favourite")
        .single();
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return {
        content: [{ type: "text", text: `Updated ${data.name}.` }],
        structuredContent: { product: data },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
    }
  },
});
