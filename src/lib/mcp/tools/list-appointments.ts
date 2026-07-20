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
  name: "list_appointments",
  title: "List appointments",
  description:
    "Return the signed-in user's hair appointments (upcoming and past).",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("How many to return (default 20)."),
    status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    try {
      if (!ctx.isAuthenticated())
        return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
      const sb = supabaseForUser(ctx);
      let q = sb
        .from("appointments")
        .select(
          "id, professional_name, professional_type, clinic_name, appointment_date, appointment_time, status, reason, notes, follow_up_needed",
        )
        .eq("user_id", ctx.getUserId())
        .order("appointment_date", { ascending: false })
        .limit(limit ?? 20);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return {
        content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
        structuredContent: { appointments: data ?? [] },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
    }
  },
});
