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
  name: "list_journal_entries",
  title: "List style journal entries",
  description: "Return the signed-in user's recent style journal entries.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("How many entries to return (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    try {
      if (!ctx.isAuthenticated())
        return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
      const sb = supabaseForUser(ctx);
      const { data, error } = await sb
        .from("journal_entries")
        .select("id, entry_date, title, mood, note, products_used, photo_paths")
        .eq("user_id", ctx.getUserId())
        .order("entry_date", { ascending: false })
        .limit(limit ?? 10);
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return {
        content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
        structuredContent: { entries: data ?? [] },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
    }
  },
});
