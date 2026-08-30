// deno-lint-ignore-file no-explicit-any
// Records subscription cancellations into public.subscription_cancellations.
//
// Written ONLY here, by the three Stripe webhooks, using the service role. The
// table is admin-read-only (RLS: has_role(auth.uid(),'admin')), so the reason a
// member gave Stripe is never readable by the member, a professional, or the
// client passport view.
//
// Shape: append-only history. Each cancellation event writes its own row, and a
// deterministic `stripe_event_key` makes redelivered/duplicate events idempotent
// without overwriting an earlier cancellation. A member who cancels, resubscribes
// and cancels again therefore has one row per cancellation, ordered by
// recorded_at.
//
// Timing data (canceled_at, cancel_at_period_end) is ALWAYS captured, whether or
// not Stripe supplied cancellation_details.feedback — reason/comment are simply
// null when the portal's cancellation question is not enabled.

export type CancellationAccountType = "consumer" | "professional" | "brand";

export async function recordSubscriptionCancellation(
  admin: any,
  opts: {
    userId: string;
    accountType: CancellationAccountType;
    sub: any;
    eventType: string;
  },
): Promise<void> {
  const { userId, accountType, sub, eventType } = opts;
  if (!userId || !sub) return;

  const cancelAtPeriodEnd = sub.cancel_at_period_end === true;
  const isDeleted = eventType === "customer.subscription.deleted" ||
    sub.status === "canceled";
  // Only two situations are a cancellation: the subscription ended, or it is
  // flagged to end at the period end.
  if (!isDeleted && !cancelAtPeriodEnd) return;

  const details = (sub.cancellation_details ?? {}) as {
    feedback?: string | null;
    comment?: string | null;
    reason?: string | null;
  };

  const canceledAt = sub.canceled_at
    ? new Date(sub.canceled_at * 1000).toISOString()
    : null;

  // Deterministic per-cancellation key: the subscription plus the phase
  // (scheduled vs ended) plus Stripe's own canceled_at timestamp. Redeliveries
  // collapse onto the same row; a later re-subscription + cancellation gets a
  // new canceled_at and therefore a new row.
  const phase = isDeleted ? "ended" : "scheduled";
  const stripeEventKey = `${sub.id}:${phase}:${canceledAt ?? "unknown"}`;

  const customerId = typeof sub.customer === "string"
    ? sub.customer
    : sub.customer?.id ?? null;

  const { error } = await admin
    .from("subscription_cancellations")
    .upsert(
      {
        user_id: userId,
        account_type: accountType,
        stripe_subscription_id: sub.id ?? null,
        stripe_customer_id: customerId,
        cancellation_reason: details.feedback ?? null,
        cancellation_comment: details.comment ?? null,
        cancellation_source: details.reason ?? null,
        canceled_at: canceledAt,
        cancel_at_period_end: cancelAtPeriodEnd,
        stripe_event_key: stripeEventKey,
      },
      { onConflict: "stripe_event_key" },
    );
  // Never fail the webhook over the audit write.
  if (error) console.error("[cancellation-capture] write failed", error);
}
