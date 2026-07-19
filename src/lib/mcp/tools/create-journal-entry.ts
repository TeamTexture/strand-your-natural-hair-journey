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
  name: "create_journal_entry",
  title: "Create style journal entry",
  description: "Create a new style journal entry for the signed-in user.",
  inputSchema: {
    title: z.string().trim().min(1).describe("Short title for the entry."),
    note: z.string().optional().describe("Free-text note about the style, feel, or observations."),
    mood: z.string().optional().describe("Optional mood tag."),
    entry_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("ISO date (YYYY-MM-DD). Defaults to today."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ title, note, mood, entry_date }, ctx) => {
    try {
      if (!ctx.isAuthenticated())
        return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
      const sb = supabaseForUser(ctx);
      const { data, error } = await sb
        .from("journal_entries")
        .insert({
          user_id: ctx.getUserId(),
          title,
          note: note ?? null,
          mood: mood ?? null,
          entry_date: entry_date ?? new Date().toISOString().slice(0, 10),
        })
        .select("id, entry_date, title, mood, note")
        .single();
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return {
        content: [{ type: "text", text: `Created journal entry ${data.id}` }],
        structuredContent: { entry: data },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
    }
  },
});
