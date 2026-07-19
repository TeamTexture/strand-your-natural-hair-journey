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
  name: "list_wash_days",
  title: "List wash days",
  description:
    "Return the signed-in user's recent wash-day entries (date, scalp feel, breakage, stress level, duration, notes).",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("How many entries to return (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("wash_days")
      .select(
        "id, wash_date, scalp_feel, breakage, stress_level, duration_min, style_after, hair_feel_note, ai_insight",
      )
      .eq("user_id", ctx.getUserId())
      .order("wash_date", { ascending: false })
      .limit(limit ?? 10);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { wash_days: data ?? [] },
    };
  },
});
