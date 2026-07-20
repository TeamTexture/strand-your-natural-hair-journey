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
  name: "create_appointment",
  title: "Create appointment",
  description:
    "Schedule or log an appointment with a hair professional (trichologist, dermatologist, curl specialist) for the signed-in user.",
  inputSchema: {
    professional_name: z.string().trim().min(1),
    professional_type: z.string().optional().describe("e.g. 'Trichologist', 'Dermatologist', 'Curl Specialist'."),
    clinic_name: z.string().optional(),
    appointment_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("ISO date (YYYY-MM-DD)."),
    appointment_time: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .optional()
      .describe("24h time HH:MM."),
    reason: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
    follow_up_needed: z.boolean().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      if (!ctx.isAuthenticated())
        return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
      const sb = supabaseForUser(ctx);
      const { data, error } = await sb
        .from("appointments")
        .insert({
          user_id: ctx.getUserId(),
          professional_name: input.professional_name,
          professional_type: input.professional_type ?? null,
          clinic_name: input.clinic_name ?? null,
          appointment_date: input.appointment_date,
          appointment_time: input.appointment_time ?? null,
          reason: input.reason ?? null,
          notes: input.notes ?? null,
          status: input.status ?? "scheduled",
          follow_up_needed: input.follow_up_needed ?? false,
        })
        .select("id, professional_name, appointment_date, appointment_time, status")
        .single();
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return {
        content: [
          { type: "text", text: `Created appointment ${data.id} with ${data.professional_name} on ${data.appointment_date}.` },
        ],
        structuredContent: { appointment: data },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Tool error: ${msg}` }], isError: true };
    }
  },
});
