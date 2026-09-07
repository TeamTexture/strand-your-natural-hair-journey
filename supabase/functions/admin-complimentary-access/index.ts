// deno-lint-ignore-file no-explicit-any
// admin-complimentary-access — gift a member free access until a chosen date,
// or end that gift early. Admin only.
//
// HOW IT WORKS: the gift is a real Stripe trial on the member's real
// subscription, tagged in metadata with `strand_complimentary_until`. Stripe
// stays the source of truth for billing; when the date passes Stripe either
// starts charging her (if a card is on file) or cancels, and the ordinary
// consumer webhook mirrors whatever happens onto consumer_subscriptions.
//
// Actions:
//   { action: "grant", user_id, end_date: "YYYY-MM-DD", reason?, note? }
//   { action: "end",   user_id, reason?, note? }
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import {
  COMPLIMENTARY_META_KEY,
  isValidDateString,
  londonEndOfDayIso,
  londonEndOfDayUnix,
} from "../_shared/complimentary.ts";
import { syncSuperchatLists } from "../_shared/superchat-lists.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Statuses where the Stripe subscription can still be extended in place. */
const LIVE_STATUSES = new Set(["trialing", "active", "past_due", "unpaid", "incomplete"]);

async function consumerPriceId(admin: any): Promise<string> {
  const env = Deno.env.get("STRIPE_CONSUMER_PRICE_ID") ?? "";
  if (env) return env;
  const { data } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "stripe_consumer_price_id")
    .maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  return typeof v === "string" ? v : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsErr } = await authed.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const actorId = claimsData.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: actorId,
      _role: "admin",
    });
    if (roleErr) return json({ error: "Role check failed" }, 500);
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String((body as any).action ?? "");
    const userId = String((body as any).user_id ?? "");
    const reason = (body as any).reason ? String((body as any).reason).slice(0, 200) : null;
    const note = (body as any).note ? String((body as any).note).slice(0, 1000) : null;
    if (!userId) return json({ error: "user_id required" }, 400);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!stripeKey) return json({ error: "Stripe is not configured" }, 500);
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

    const { data: existing } = await admin
      .from("consumer_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status, complimentary_until, tier")
      .eq("user_id", userId)
      .maybeSingle();
    const row = (existing ?? null) as {
      stripe_customer_id?: string | null;
      stripe_subscription_id?: string | null;
      status?: string | null;
      complimentary_until?: string | null;
      tier?: string | null;
    } | null;

    // ── grant ──────────────────────────────────────────────────────────────
    if (action === "grant") {
      const endDate = (body as any).end_date;
      if (!isValidDateString(endDate)) return json({ error: "end_date must be YYYY-MM-DD" }, 400);
      const untilUnix = londonEndOfDayUnix(endDate);
      if (untilUnix * 1000 <= Date.now()) {
        return json({ error: "end_date must be in the future" }, 400);
      }

      let sub: Stripe.Subscription | null = null;
      let liveSub: Stripe.Subscription | null = null;
      if (row?.stripe_subscription_id) {
        try {
          const s = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
          if (LIVE_STATUSES.has(s.status)) liveSub = s;
        } catch (_e) {
          liveSub = null;
        }
      }

      if (liveSub) {
        // Extend the existing subscription's trial to the gift date. Billing is
        // simply pushed out; her card, tier and cancel settings are untouched.
        sub = await stripe.subscriptions.update(liveSub.id, {
          trial_end: untilUnix,
          proration_behavior: "none",
          cancel_at_period_end: false,
          metadata: { ...(liveSub.metadata ?? {}), [COMPLIMENTARY_META_KEY]: endDate },
        });
      } else {
        // No live subscription — create one that is on a trial until the date.
        // With no card on file Stripe cancels it when the trial ends rather
        // than producing an unpayable invoice.
        const priceId = await consumerPriceId(admin);
        if (!priceId) return json({ error: "Consumer price is not configured" }, 500);

        let customerId = row?.stripe_customer_id ?? null;
        if (customerId) {
          try {
            const c = await stripe.customers.retrieve(customerId);
            if ((c as any).deleted) customerId = null;
          } catch (_e) {
            customerId = null;
          }
        }
        if (!customerId) {
          const { data: authUser } = await admin.auth.admin.getUserById(userId);
          const email = authUser?.user?.email ?? undefined;
          const customer = await stripe.customers.create({
            email,
            metadata: { consumer_user_id: userId },
          });
          customerId = customer.id;
        }

        sub = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: priceId }],
          trial_end: untilUnix,
          payment_settings: { save_default_payment_method: "on_subscription" },
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          metadata: { consumer_user_id: userId, [COMPLIMENTARY_META_KEY]: endDate },
        });
      }

      const item = sub.items.data[0];
      const periodEnd = (item as any)?.current_period_end ?? (sub as any).current_period_end ?? null;
      const { error: upErr } = await admin.from("consumer_subscriptions").upsert(
        {
          user_id: userId,
          stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          stripe_subscription_id: sub.id,
          status: sub.status,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          price_id: item?.price?.id ?? null,
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
          trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          complimentary_until: londonEndOfDayIso(endDate),
          paused: false,
          pause_resumes_at: null,
        } as any,
        { onConflict: "user_id" },
      );
      if (upErr) throw upErr;

      await admin.from("complimentary_grants").insert({
        user_id: userId,
        set_by: actorId,
        action: "granted",
        end_date: endDate,
        reason,
        note,
        stripe_subscription_id: sub.id,
      } as any);

      await syncSuperchatLists(admin as any, userId, "complimentary_granted").catch(() => {});

      return json({
        ok: true,
        status: sub.status,
        complimentary_until: londonEndOfDayIso(endDate),
      });
    }

    // ── end early ──────────────────────────────────────────────────────────
    if (action === "end") {
      if (!row?.stripe_subscription_id) {
        return json({ error: "This member has no subscription to change." }, 400);
      }
      let sub: Stripe.Subscription;
      try {
        sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, {
          expand: ["default_payment_method", "customer"],
        });
      } catch (_e) {
        return json({ error: "That subscription could not be read from Stripe." }, 400);
      }

      const customer = sub.customer as Stripe.Customer | string;
      const hasCard = !!sub.default_payment_method ||
        (typeof customer !== "string" &&
          !!(customer as any).invoice_settings?.default_payment_method);

      let result: Stripe.Subscription;
      if (sub.status === "trialing" && !hasCard) {
        // Nothing to bill — end the subscription now rather than leave an
        // unpayable invoice behind.
        result = await stripe.subscriptions.cancel(sub.id);
      } else if (sub.status === "trialing") {
        result = await stripe.subscriptions.update(sub.id, {
          trial_end: "now",
          proration_behavior: "none",
          metadata: { ...(sub.metadata ?? {}), [COMPLIMENTARY_META_KEY]: "" },
        });
      } else {
        // Already billing normally — just drop the gift tag.
        result = await stripe.subscriptions.update(sub.id, {
          metadata: { ...(sub.metadata ?? {}), [COMPLIMENTARY_META_KEY]: "" },
        });
      }

      const item = result.items.data[0];
      const periodEnd = (item as any)?.current_period_end ??
        (result as any).current_period_end ?? null;
      const { error: upErr } = await admin
        .from("consumer_subscriptions")
        .update({
          status: result.status,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          cancel_at_period_end: result.cancel_at_period_end ?? false,
          trial_end: result.trial_end ? new Date(result.trial_end * 1000).toISOString() : null,
          complimentary_until: null,
        } as any)
        .eq("user_id", userId);
      if (upErr) throw upErr;

      await admin.from("complimentary_grants").insert({
        user_id: userId,
        set_by: actorId,
        action: "ended_early",
        end_date: null,
        reason,
        note,
        stripe_subscription_id: result.id,
      } as any);

      await syncSuperchatLists(admin as any, userId, "complimentary_ended").catch(() => {});

      return json({ ok: true, status: result.status, complimentary_until: null });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[admin-complimentary-access]", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
