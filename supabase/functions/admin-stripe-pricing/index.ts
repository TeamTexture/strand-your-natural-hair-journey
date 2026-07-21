// deno-lint-ignore-file no-explicit-any
// admin-stripe-pricing — Stripe-synced pricing for /admin/settings.
//
// Actions (admin-gated via has_role):
//   { action: "fetch" }                      → returns live price + config state per product
//   { action: "update", kind, amount_gbp }   → creates a new Stripe price, updates
//                                              platform_settings atomically, archives the old
//                                              price, and records an audit row.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Kind = "consumer" | "pro";

const PRICE_ID_KEY: Record<Kind, string> = {
  consumer: "stripe_consumer_price_id",
  pro: "stripe_pro_price_id",
};
const DISPLAY_KEY: Record<Kind, string> = {
  consumer: "consumer_monthly_price_gbp",
  pro: "pro_monthly_price_gbp",
};
const ENV_PRICE_ID: Record<Kind, string> = {
  consumer: "STRIPE_CONSUMER_PRICE_ID",
  pro: "STRIPE_PRO_PRICE_ID",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const KINDS: Kind[] = ["consumer", "pro"];

async function loadPriceId(admin: ReturnType<typeof createClient>, kind: Kind): Promise<string> {
  const envVal = Deno.env.get(ENV_PRICE_ID[kind]) ?? "";
  if (envVal) return envVal;
  const { data } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", PRICE_ID_KEY[kind])
    .maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  return typeof v === "string" ? v : "";
}

async function loadDisplayPrice(admin: ReturnType<typeof createClient>, kind: Kind): Promise<number | null> {
  const { data } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", DISPLAY_KEY[kind])
    .maybeSingle();
  const v = (data as { value?: unknown } | null)?.value;
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isFinite(n) ? n : null;
}

async function upsertSetting(admin: ReturnType<typeof createClient>, key: string, value: unknown) {
  const { error } = await admin
    .from("platform_settings")
    .upsert({ key, value } as any, { onConflict: "key" });
  if (error) throw new Error(`platform_settings upsert failed: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── AuthN ────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await authed.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    // ── AuthZ (server-side admin check) ─────────────────────────
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) return json({ error: "Role check failed" }, 500);
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String((body as any).action ?? "");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

    // ── fetch ───────────────────────────────────────────────────
    if (action === "fetch") {
      const stripe_configured = !!stripeKey;
      const stripe = stripe_configured ? new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any }) : null;

      const products = await Promise.all(KINDS.map(async (kind) => {
        const price_id = await loadPriceId(admin, kind);
        const cached_display_gbp = await loadDisplayPrice(admin, kind);
        if (!stripe || !price_id) {
          return { kind, price_id, cached_display_gbp, connected: false, live: null as null | Record<string, unknown>, error: null as string | null };
        }
        try {
          const price = await stripe.prices.retrieve(price_id, { expand: ["product"] });
          const amount = price.unit_amount != null ? price.unit_amount / 100 : null;
          const currency = (price.currency ?? "gbp").toLowerCase();
          const interval = price.recurring?.interval ?? null;
          const active = price.active;
          const product = price.product as any;
          const product_id = typeof product === "string" ? product : product?.id ?? null;
          const product_name = typeof product === "string" ? null : product?.name ?? null;

          // Best-effort: keep the display cache in sync when it drifts from Stripe.
          if (amount != null && cached_display_gbp !== amount) {
            await upsertSetting(admin, DISPLAY_KEY[kind], amount).catch(() => {});
          }

          return {
            kind, price_id, cached_display_gbp, connected: true, error: null,
            live: { amount_gbp: amount, currency, interval, active, product_id, product_name },
          };
        } catch (e) {
          return { kind, price_id, cached_display_gbp, connected: false, live: null, error: (e as Error).message };
        }
      }));

      return json({ stripe_configured, products });
    }

    // ── update ──────────────────────────────────────────────────
    if (action === "update") {
      if (!stripeKey) return json({ error: "Stripe secret key not configured" }, 400);
      const kind = String((body as any).kind ?? "") as Kind;
      const amount_gbp = Number((body as any).amount_gbp);
      const notes = typeof (body as any).notes === "string" ? String((body as any).notes).slice(0, 500) : null;
      if (!KINDS.includes(kind)) return json({ error: "Invalid product kind" }, 400);
      if (!isFinite(amount_gbp) || amount_gbp <= 0 || amount_gbp > 999) {
        return json({ error: "Enter a monthly price between £0.01 and £999" }, 400);
      }
      // Round to whole pence to avoid Stripe rejecting fractional pence.
      const unit_amount = Math.round(amount_gbp * 100);

      const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

      const oldPriceId = await loadPriceId(admin, kind);
      if (!oldPriceId) {
        return json({
          error: "No existing Stripe price is linked. Add one in Advanced first, or create the product in Stripe.",
        }, 400);
      }

      // Resolve product from the existing price so we create the new one on the same product.
      let oldPrice;
      try {
        oldPrice = await stripe.prices.retrieve(oldPriceId);
      } catch (e) {
        return json({ error: `Could not read existing Stripe price: ${(e as Error).message}` }, 400);
      }
      const productId = typeof oldPrice.product === "string" ? oldPrice.product : oldPrice.product?.id;
      if (!productId) return json({ error: "Existing Stripe price is not attached to a product" }, 400);
      const currency = (oldPrice.currency ?? "gbp").toLowerCase();
      const interval = oldPrice.recurring?.interval ?? "month";
      const interval_count = oldPrice.recurring?.interval_count ?? 1;

      if (unit_amount === oldPrice.unit_amount) {
        return json({ error: "New price is the same as the current live price" }, 400);
      }

      // 1. Create the new price.
      let newPrice;
      try {
        newPrice = await stripe.prices.create({
          product: productId,
          currency,
          unit_amount,
          recurring: { interval: interval as any, interval_count },
        });
      } catch (e) {
        return json({ error: `Stripe rejected the new price: ${(e as Error).message}` }, 400);
      }

      // 2. Update platform_settings atomically-ish (two rows, best effort together).
      try {
        await upsertSetting(admin, PRICE_ID_KEY[kind], newPrice.id);
        await upsertSetting(admin, DISPLAY_KEY[kind], amount_gbp);
      } catch (e) {
        // Roll back the newly-created Stripe price so we don't leak orphans.
        await stripe.prices.update(newPrice.id, { active: false }).catch(() => {});
        return json({ error: (e as Error).message }, 500);
      }

      // 3. Archive the old price (non-fatal on failure).
      let archived = true;
      try {
        await stripe.prices.update(oldPriceId, { active: false });
      } catch (e) {
        archived = false;
        console.warn("archive old price failed", e);
      }

      // 4. Audit log.
      await admin.from("platform_pricing_changes").insert({
        changed_by: userId,
        product_kind: kind,
        old_price_id: oldPriceId,
        new_price_id: newPrice.id,
        old_amount_gbp: oldPrice.unit_amount != null ? oldPrice.unit_amount / 100 : null,
        new_amount_gbp: amount_gbp,
        currency,
        interval,
        notes,
      }).then(({ error }) => { if (error) console.warn("audit insert failed", error); });

      return json({
        ok: true,
        kind,
        old_price_id: oldPriceId,
        new_price_id: newPrice.id,
        amount_gbp,
        currency,
        interval,
        archived_old: archived,
      });
    }

    // ── manual override ─────────────────────────────────────────
    // Emergency-only: set the raw price id without touching Stripe. The next
    // "fetch" will re-hydrate cached_display_gbp from Stripe.
    if (action === "override") {
      const kind = String((body as any).kind ?? "") as Kind;
      const price_id = String((body as any).price_id ?? "").trim();
      if (!KINDS.includes(kind)) return json({ error: "Invalid product kind" }, 400);
      if (!/^price_[A-Za-z0-9]+$/.test(price_id)) return json({ error: "Invalid Stripe price id" }, 400);
      await upsertSetting(admin, PRICE_ID_KEY[kind], price_id);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("admin-stripe-pricing error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
