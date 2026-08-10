// Member-initiated plan share invitation. Composition, gating, logging and
// idempotency all live in the shared send path.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { dispatchEmail, type DispatchResult } from "./core.ts";

export async function sendShareInvitation(
  admin: SupabaseClient,
  shareId: string,
): Promise<DispatchResult> {
  const { data: sh } = await (admin as any)
    .from("treatment_plan_shares")
    .select("id, status, plan_id, owner_user_id, professional_user_id, invited_email, invited_name")
    .eq("id", shareId)
    .maybeSingle();

  if (!sh) return { ok: false, sent: false, error: "share_not_found" };
  if (sh.status !== "pending") return { ok: true, sent: false, reason: "not_pending" };

  let to = typeof sh.invited_email === "string" ? sh.invited_email : "";
  if (!to && sh.professional_user_id) {
    const { data: u } = await admin.auth.admin.getUserById(sh.professional_user_id as string);
    to = u?.user?.email ?? "";
  }
  if (!to) return { ok: false, sent: false, error: "no_recipient" };

  let name = "there";
  if (typeof sh.invited_name === "string" && sh.invited_name.trim()) {
    name = sh.invited_name.trim().split(" ")[0];
  } else if (sh.professional_user_id) {
    const { data: pp } = await (admin as any)
      .from("pro_profiles")
      .select("display_name")
      .eq("user_id", sh.professional_user_id)
      .maybeSingle();
    if (pp?.display_name) name = String(pp.display_name).split(" ")[0];
  }

  const { data: plan } = await (admin as any)
    .from("treatment_plans")
    .select("title, duration_weeks")
    .eq("id", sh.plan_id)
    .maybeSingle();

  const { data: pr } = await (admin as any)
    .from("profiles")
    .select("display_name")
    .eq("user_id", sh.owner_user_id)
    .maybeSingle();

  const weeks = Number(plan?.duration_weeks ?? 0);

  return await dispatchEmail(
    {
      templateKey: "treatment-plan-share",
      to,
      recipientUserId: (sh.professional_user_id as string | null) ?? null,
      triggerEvent: "treatment_plan_share.created",
      relatedTable: "treatment_plan_shares",
      relatedId: String(sh.id),
      idempotencyKey: `treatment-plan-share:${sh.id}`,
      data: {
        name,
        share_id: String(sh.id),
        plan_title: plan?.title ?? "Treatment plan",
        duration: weeks ? `${weeks} week${weeks === 1 ? "" : "s"}` : "—",
        member_name: pr?.display_name ?? "A STRAND member",
      },
    },
    admin,
  );
}
