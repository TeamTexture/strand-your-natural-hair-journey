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
  name: "log_wash_day",
  title: "Log wash day",
  description:
    "Create a wash-day entry for the signed-in user. Use to record how a wash went: scalp feel, breakage, stress, duration, and any note. Product IDs must come from `list_shelf_products`.",
  inputSchema: {
    wash_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("ISO date (YYYY-MM-DD). Defaults to today."),
    scalp_feel: z.string().optional().describe("e.g. 'clean', 'itchy', 'oily'."),
    breakage: z.string().optional().describe("e.g. 'none', 'light', 'moderate', 'heavy'."),
    stress_level: z.number().int().min(1).max(10).optional().describe("1–10 stress this week."),
    duration_min: z.number().int().min(1).max(720).optional().describe("Wash duration in minutes."),
    style_after: z.string().optional().describe("Style worn after the wash."),
    hair_feel_note: z.string().optional().describe("Free-text note on how the hair felt."),
    product_ids: z
      .array(z.string().uuid())
      .optional()
      .describe("Array of user_products.id used during this wash."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      if (!ctx.isAuthenticated())
        return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
      const sb = supabaseForUser(ctx);
      const { data, error } = await sb
        .from("wash_days")
        .insert({
          user_id: ctx.getUserId(),
          wash_date: input.wash_date ?? new Date().toISOString().slice(0, 10),
          scalp_feel: input.scalp_feel ?? null,
          breakage: input.breakage ?? null,
          stress_level: input.stress_level ?? null,
          duration_min: input.duration_min ?? null,
          style_after: input.style_after ?? null,
          hair_feel_note: input.hair_feel_note ?? null,
          product_ids: input.product_ids ?? [],
        })
        .select("id, wash_date")
        .single();
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return {
        content: [{ type: "text", text: `Logged wash day ${data.id} on ${data.wash_date}` }],
        structuredContent: { wash_day: data },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
    }
  },
});
