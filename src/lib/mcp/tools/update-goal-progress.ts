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
  name: "update_goal_progress",
  title: "Update goal progress",
  description:
    "Update `current_value`, `status`, or `notes` on a hair goal. Use `list_goals` first to get the goal id.",
  inputSchema: {
    goal_id: z.string().uuid(),
    current_value: z.number().optional(),
    status: z.enum(["active", "paused", "achieved", "abandoned"]).optional(),
    notes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      if (!ctx.isAuthenticated())
        return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
      const sb = supabaseForUser(ctx);
      const patch: Record<string, unknown> = {};
      if (input.current_value !== undefined) patch.current_value = input.current_value;
      if (input.status !== undefined) patch.status = input.status;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (Object.keys(patch).length === 0)
        return { content: [{ type: "text", text: "No changes provided." }], isError: true };
      const { data, error } = await sb
        .from("user_goals")
        .update(patch)
        .eq("id", input.goal_id)
        .eq("user_id", ctx.getUserId())
        .select("id, title, current_value, target_value, unit, status")
        .single();
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return {
        content: [{ type: "text", text: `Updated goal ${data.title}.` }],
        structuredContent: { goal: data },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
    }
  },
});
