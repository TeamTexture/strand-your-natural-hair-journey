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
  name: "create_goal",
  title: "Create hair goal",
  description:
    "Create a new hair goal for the signed-in user (e.g. length retention, moisture, breakage reduction). Length goals should route through the journal in-app, but any measurable target is fine.",
  inputSchema: {
    title: z.string().trim().min(1).describe("Short goal title."),
    kind: z.string().optional().describe("Category, e.g. 'length', 'moisture', 'breakage', 'scalp'."),
    start_value: z.number().optional().describe("Baseline measurement."),
    current_value: z.number().optional().describe("Current measurement."),
    target_value: z.number().optional().describe("Target measurement."),
    unit: z.string().optional().describe("Unit, e.g. 'inches', 'cm', '%'."),
    target_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("ISO date (YYYY-MM-DD)."),
    target_text: z.string().optional().describe("Free-text target when a number doesn't apply."),
    notes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      if (!ctx.isAuthenticated())
        return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
      const sb = supabaseForUser(ctx);
      const { data, error } = await sb
        .from("user_goals")
        .insert({
          user_id: ctx.getUserId(),
          title: input.title,
          kind: input.kind ?? "general",
          start_value: input.start_value ?? 0,
          current_value: input.current_value ?? input.start_value ?? 0,
          target_value: input.target_value ?? null,
          unit: input.unit ?? "",
          target_date: input.target_date ?? null,
          target_text: input.target_text ?? null,
          notes: input.notes ?? null,
        })
        .select("id, title, kind, current_value, target_value, unit, target_date")
        .single();
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return {
        content: [{ type: "text", text: `Created goal ${data.id}: ${data.title}` }],
        structuredContent: { goal: data },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
    }
  },
});
