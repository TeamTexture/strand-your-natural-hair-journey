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
  name: "list_wishlist_items",
  title: "List wishlist items",
  description:
    "Return the signed-in user's active wishlist items (rows in `user_products` where on_wishlist=true).",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("Max items to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      if (!ctx.isAuthenticated())
        return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
      const sb = supabaseForUser(ctx);
      const { data, error } = await sb
        .from("user_products")
        .select("id, name, brand, category, ai_summary, match_score, created_at, on_shelf")
        .eq("user_id", ctx.getUserId())
        .eq("on_wishlist", true)
        .order("match_score", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(input.limit ?? 100);
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      const items = (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        brand: r.brand,
        category: r.category,
        reason: r.ai_summary,
        priority: r.match_score,
        moved_to_shelf: r.on_shelf,
        created_at: r.created_at,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
        structuredContent: { items },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
    }
  },
});
