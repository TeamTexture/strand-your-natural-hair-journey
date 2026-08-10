// Shared invitation dispatch for treatment plan assignments.
// Used by treatment-invite-email (immediate, on creation) and by the hourly
// treatment-emails sweep (safety net). Idempotency key is per assignment, so a
// double call can never double send.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { dispatchEmail, type DispatchResult } from "./core.ts";

export async function sendPlanInvitation(
  admin: SupabaseClient,
  assignmentId: string,
): Promise<DispatchResult> {
  const { data: a } = await admin
    .from("treatment_plan_assignments")
    .select(
      "id, status, client_user_id, invited_email, plan_id, professional_id, assigner_user_id, assigner_type",
    )
    .eq("id", assignmentId)
    .maybeSingle();

  if (!a) return { ok: false, sent: false, error: "assignment_not_found" };
  if (a.status !== "pending") return { ok: true, sent: false, reason: "not_pending" };

  // Recipient address: the invited email, else the account's own address.
  let to = typeof a.invited_email === "string" ? a.invited_email : "";
  let name = "there";
  if (!to && a.client_user_id) {
    const { data: u } = await admin.auth.admin.getUserById(a.client_user_id as string);
    to = u?.user?.email ?? "";
  }
  if (a.client_user_id) {
    const { data: pr } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", a.client_user_id)
      .maybeSingle();
    if (pr?.display_name) name = String(pr.display_name).split(" ")[0];
  }
  if (!to) return { ok: false, sent: false, error: "no_recipient" };

  const { data: plan } = await admin
    .from("treatment_plans")
    .select("title, duration_weeks")
    .eq("id", a.plan_id)
    .maybeSingle();

  let senderName = "STRAND";
  if (a.assigner_type === "admin") {
    senderName = "The STRAND team";
  } else if (a.professional_id) {
    const { data: pp } = await admin
      .from("pro_profiles")
      .select("display_name")
      .eq("id", a.professional_id)
      .maybeSingle();
    if (pp?.display_name) senderName = String(pp.display_name);
  }

  const weeks = Number(plan?.duration_weeks ?? 0);

  return await dispatchEmail(
    {
      templateKey: "treatment-plan-invitation",
      to,
      recipientUserId: (a.client_user_id as string | null) ?? null,
      triggerEvent: "treatment_plan_assignment.created",
      relatedTable: "treatment_plan_assignments",
      relatedId: String(a.id),
      idempotencyKey: `treatment-plan-invitation:${a.id}`,
      data: {
        name,
        assignment_id: String(a.id),
        plan_title: plan?.title ?? "Treatment plan",
        duration: weeks ? `${weeks} week${weeks === 1 ? "" : "s"}` : "—",
        sender_name: senderName,
      },
    },
    admin,
  );
}
