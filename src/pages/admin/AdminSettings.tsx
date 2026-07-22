import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ChevronDown, ChevronUp, Copy, ExternalLink, Loader2, Sparkles,
  PoundSterling, Wallet, Ticket, Webhook, ShieldOff, ShieldCheck,
} from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { smartBack } from "@/lib/smartBack";

// ── Types matching admin-stripe-pricing ─────────────────────────

type Kind = "consumer" | "pro";

interface LivePrice {
  amount_gbp: number | null;
  currency: string;
  interval: string | null;
  active: boolean;
  product_id: string | null;
  product_name: string | null;
}

interface ProductStatus {
  kind: Kind;
  price_id: string;
  cached_display_gbp: number | null;
  connected: boolean;
  live: LivePrice | null;
  error: string | null;
}

interface FetchResponse {
  stripe_configured: boolean;
  products: ProductStatus[];
}

const KIND_META: Record<Kind, { title: string; sub: string }> = {
  consumer: { title: "STRAND Membership", sub: "Consumer monthly subscription" },
  pro: { title: "STRAND Pro Membership", sub: "Professional monthly subscription" },
};

// ── Small helpers ───────────────────────────────────────────────

const formatGBP = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

const copyToClipboard = (text: string, label: string) => {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Copy failed"),
  );
};

// ── Shortcut buttons ────────────────────────────────────────────

const STRIPE_LINKS: Array<{ href: string; label: string; caption: string; icon: React.ComponentType<{ className?: string }> }> = [
  { href: "https://dashboard.stripe.com/coupons", label: "Coupons & promo codes", caption: "Pro referral codes and consumer discounts", icon: Ticket },
  { href: "https://dashboard.stripe.com/payments", label: "Payments & refunds", caption: "Issue refunds and inspect charges", icon: Wallet },
  { href: "https://dashboard.stripe.com/subscriptions", label: "Subscriptions", caption: "Cancel or investigate any customer subscription", icon: Sparkles },
  { href: "https://dashboard.stripe.com/webhooks", label: "Webhooks", caption: "Endpoint health and delivery retries", icon: Webhook },
];

// ── Product card ────────────────────────────────────────────────

interface ProductCardProps {
  status: ProductStatus;
  stripeKeyConfigured: boolean;
  onChangePrice: (kind: Kind) => void;
  onSaveOverride: (kind: Kind, priceId: string) => Promise<void>;
}

const ProductCard = ({ status, stripeKeyConfigured, onChangePrice, onSaveOverride }: ProductCardProps) => {
  const meta = KIND_META[status.kind];
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [override, setOverride] = useState("");
  const [saving, setSaving] = useState(false);

  const notConnected = !stripeKeyConfigured || !status.price_id || !status.connected;
  const live = status.live;

  return (
    <SurfaceCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-body font-semibold">Live product</p>
          <p className="font-display text-[18px] leading-tight mt-0.5">{meta.title}</p>
          <p className="text-[11.5px] text-muted-foreground font-body">{meta.sub}</p>
        </div>
        {notConnected ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-body font-semibold bg-destructive/10 text-destructive border border-destructive/30">
            <ShieldOff className="size-3" /> Not connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-body font-semibold bg-good/10 text-good border border-good/25">
            <ShieldCheck className="size-3" /> Live in Stripe
          </span>
        )}
      </div>

      {/* Live price panel */}
      <div className="mt-4">
        {notConnected ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/[0.05] p-3 flex items-start gap-2.5">
            <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-[12px] font-body leading-relaxed">
              <p className="font-semibold text-destructive">Cannot read from Stripe</p>
              <p className="text-foreground/80 mt-0.5">
                {!stripeKeyConfigured
                  ? "Stripe secret key is missing. Add STRIPE_SECRET_KEY in Project Settings → Secrets."
                  : !status.price_id
                    ? "No price id is linked to this product. Create a recurring GBP price in Stripe, then paste its id in the Advanced panel below."
                    : `Stripe returned: ${status.error ?? "an error while fetching this price."}`}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-primary/[0.06] border border-primary/15 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] font-body font-semibold text-primary/80">Current price</p>
                <p className="font-display text-[32px] leading-none mt-1 text-foreground">
                  {formatGBP(live?.amount_gbp ?? null)}
                  <span className="text-[13px] font-body text-muted-foreground ml-1">/{live?.interval ?? "month"}</span>
                </p>
              </div>
              {live?.active === false && (
                <span className="text-[10.5px] font-body font-semibold text-warn uppercase tracking-wider">Inactive</span>
              )}
            </div>
            {live?.product_name && (
              <p className="text-[11px] text-muted-foreground font-body mt-2">
                Stripe product: <span className="text-foreground/80">{live.product_name}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Change price CTA */}
      <div className="mt-3">
        <Button
          onClick={() => onChangePrice(status.kind)}
          disabled={notConnected || !live?.amount_gbp}
          variant="outline"
          className="w-full"
        >
          <PoundSterling className="size-4 mr-1.5" /> Change price
        </Button>
      </div>

      {/* Advanced disclosure */}
      <button
        type="button"
        onClick={() => setAdvancedOpen(o => !o)}
        className="mt-4 w-full flex items-center justify-between text-[11px] font-body font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-primary transition-colors"
      >
        <span>Advanced</span>
        {advancedOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>
      {advancedOpen && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          <div>
            <p className="text-[10.5px] uppercase tracking-wider font-body font-semibold text-primary/80 mb-1">Stripe price id</p>
            <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-2 text-[11.5px] font-mono break-all">
              <span className="flex-1 min-w-0 break-all">{status.price_id || "— not set —"}</span>
              {status.price_id && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(status.price_id, "Price id")}
                  className="p-1 rounded hover:bg-primary/10 shrink-0"
                  aria-label="Copy price id"
                >
                  <Copy className="size-3.5 text-primary" />
                </button>
              )}
            </div>
          </div>
          <div>
            <p className="text-[10.5px] uppercase tracking-wider font-body font-semibold text-primary/80 mb-1">Emergency override</p>
            <p className="text-[11px] font-body text-muted-foreground mb-2 leading-snug">
              Only use if Stripe and the app have drifted out of sync. This does not create a new price — it just points the app at an existing one.
            </p>
            <div className="flex gap-2">
              <Input
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                placeholder="price_..."
                className="font-mono text-[12px]"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!override.trim() || saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSaveOverride(status.kind, override.trim());
                    setOverride("");
                  } finally { setSaving(false); }
                }}
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SurfaceCard>
  );
};

// ── Change-price dialog ─────────────────────────────────────────

interface ChangeDialogProps {
  kind: Kind | null;
  current: number | null;
  onClose: () => void;
  onConfirm: (amount: number) => Promise<void>;
}

const ChangeDialog = ({ kind, current, onClose, onConfirm }: ChangeDialogProps) => {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const open = kind !== null;

  const parsed = parseFloat(amount);
  const valid = isFinite(parsed) && parsed > 0 && parsed <= 999 && parsed !== current;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setAmount(""); } }}>
      <DialogContent className="w-[calc(100vw-32px)] max-w-[380px] rounded-[20px]">
        <DialogTitle className="font-display text-lg leading-tight">
          Change {kind ? KIND_META[kind].title : ""} price
        </DialogTitle>
        <DialogDescription className="text-[12.5px] font-body leading-relaxed">
          Enter the new monthly price. This creates a brand-new price in Stripe and points the app at it.
        </DialogDescription>

        <div className="mt-1 rounded-xl bg-warn/[0.08] border border-warn/30 p-3">
          <div className="flex gap-2">
            <AlertTriangle className="size-4 text-warn shrink-0 mt-0.5" />
            <ul className="text-[12px] font-body text-foreground/85 space-y-1 leading-relaxed">
              <li>Existing subscribers <strong>stay on their current price</strong>.</li>
              <li>Only <strong>new subscribers</strong> will be charged {kind && current != null ? "the new" : "this"} amount.</li>
              <li>The old Stripe price is archived so it can't be reused by mistake.</li>
            </ul>
          </div>
        </div>

        <div className="mt-3">
          <label className="text-[10.5px] uppercase tracking-wider font-body font-semibold text-primary/80 mb-1 block">
            New monthly price
          </label>
          <div className="flex items-center gap-2">
            <span className="font-display text-[24px] text-primary">£</span>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max="999"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={current != null ? current.toFixed(2) : "9.99"}
              className="text-[20px] font-display"
              autoFocus
            />
            <span className="text-[13px] font-body text-muted-foreground">/mo</span>
          </div>
          {current != null && (
            <p className="text-[11px] font-body text-muted-foreground mt-2">
              Current live price: <span className="text-foreground">{formatGBP(current)}</span>
            </p>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            className="flex-1"
            disabled={!valid || busy}
            onClick={async () => {
              if (!valid) return;
              setBusy(true);
              try {
                await onConfirm(parsed);
                setAmount("");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Create new price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Page ────────────────────────────────────────────────────────

const AdminSettings = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [changingKind, setChangingKind] = useState<Kind | null>(null);

  const q = useQuery({
    queryKey: ["admin", "stripe-pricing"],
    queryFn: async (): Promise<FetchResponse> => {
      const { data, error } = await supabase.functions.invoke("admin-stripe-pricing", {
        body: { action: "fetch" },
      });
      if (error) throw error;
      return data as FetchResponse;
    },
  });

  const changing = useMutation({
    mutationFn: async ({ kind, amount }: { kind: Kind; amount: number }) => {
      const { data, error } = await supabase.functions.invoke("admin-stripe-pricing", {
        body: { action: "update", kind, amount_gbp: amount },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (_res, vars) => {
      toast.success(`${KIND_META[vars.kind].title} is now ${formatGBP(vars.amount)}/mo. New subscribers only.`);
      setChangingKind(null);
      qc.invalidateQueries({ queryKey: ["admin", "stripe-pricing"] });
      qc.invalidateQueries({ queryKey: ["platform_settings"] });
    },
    onError: (e) => toast.error((e as Error).message || "Could not update price"),
  });

  const override = useMutation({
    mutationFn: async ({ kind, price_id }: { kind: Kind; price_id: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-stripe-pricing", {
        body: { action: "override", kind, price_id },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      toast.success("Price id updated. Re-fetching from Stripe…");
      qc.invalidateQueries({ queryKey: ["admin", "stripe-pricing"] });
      qc.invalidateQueries({ queryKey: ["platform_settings"] });
    },
    onError: (e) => toast.error((e as Error).message || "Could not save price id"),
  });

  const products = q.data?.products ?? [];
  const stripeKeyConfigured = q.data?.stripe_configured ?? false;
  const currentForDialog = changingKind
    ? products.find(p => p.kind === changingKind)?.live?.amount_gbp ?? null
    : null;

  return (
    <ScreenLayout>
      <TitleBar title="Settings" onBack={smartBack(nav, "/admin")} />

      <div className="px-5 pb-10 space-y-4">
        {/* Header context */}
        <SurfaceCard tone="gold">
          <div className="flex items-start gap-2.5">
            <div className="size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <PoundSterling className="size-4" />
            </div>
            <div>
              <p className="font-display text-[16px] leading-tight">Subscription pricing</p>
              <p className="text-[11.5px] font-body text-muted-foreground leading-snug mt-0.5">
                Stripe is the source of truth. Prices shown here are pulled live and updates are pushed
                straight into Stripe on save.
              </p>
            </div>
          </div>
        </SurfaceCard>

        {/* Not-connected banner */}
        {q.isSuccess && !stripeKeyConfigured && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/[0.06] p-3 flex items-start gap-2.5">
            <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-[12px] font-body leading-relaxed">
              <p className="font-semibold text-destructive">Stripe secret key is not configured</p>
              <p className="text-foreground/80 mt-0.5">
                Add <code className="text-[11px] bg-muted px-1 rounded">STRIPE_SECRET_KEY</code> in Project Settings → Secrets, then reload this page.
              </p>
            </div>
          </div>
        )}

        {/* Product cards */}
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center font-body">
            <Loader2 className="size-4 animate-spin" /> Reading prices from Stripe…
          </div>
        ) : q.isError ? (
          <SurfaceCard>
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-[12.5px] font-body leading-relaxed">
                <p className="font-semibold text-destructive">Could not load pricing</p>
                <p className="text-muted-foreground mt-0.5">{(q.error as Error).message}</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => q.refetch()}>Retry</Button>
              </div>
            </div>
          </SurfaceCard>
        ) : (
          products.map(p => (
            <ProductCard
              key={p.kind}
              status={p}
              stripeKeyConfigured={stripeKeyConfigured}
              onChangePrice={setChangingKind}
              onSaveOverride={async (kind, price_id) => { await override.mutateAsync({ kind, price_id }); }}
            />
          ))
        )}

        {/* Brand access — note-only entry (annual, separate Stripe product) */}
        <SurfaceCard>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-body font-semibold">Note</p>
              <p className="font-display text-[18px] leading-tight mt-0.5">STRAND Brand Access</p>
              <p className="text-[11.5px] text-muted-foreground font-body">Brand annual subscription</p>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10.5px] font-body font-semibold bg-primary/10 text-primary border border-primary/25">
              £99 / year
            </span>
          </div>
          <p className="text-[12px] font-body text-muted-foreground leading-relaxed mt-3">
            Price is set in Stripe on the product linked to <code className="text-[11px] bg-muted px-1 rounded">STRIPE_BRAND_PRICE_ID</code>.
            To change the amount, create a new annual GBP price in Stripe and update that secret.
            Per-placement fees (£50 / £75 / £100 per day) are billed separately at approval.
          </p>
        </SurfaceCard>

        {/* Manage in Stripe */}
        <div className="pt-2">
          <p className="text-[10.5px] uppercase tracking-[0.22em] font-body font-semibold text-primary mb-2">Manage in Stripe</p>
          <SurfaceCard>
            <p className="text-[12px] font-body text-muted-foreground leading-relaxed mb-3">
              Coupons, promotion codes, refunds, and webhook health are all managed in the Stripe dashboard directly. Changes take effect immediately for STRAND checkouts.
            </p>
            <div className="space-y-2">
              {STRIPE_LINKS.map(l => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/[0.04] transition-colors",
                  )}
                >
                  <div className="size-9 rounded-full bg-primary/12 text-primary flex items-center justify-center shrink-0">
                    <l.icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-body font-semibold text-foreground leading-tight">{l.label}</p>
                    <p className="text-[11px] text-muted-foreground font-body truncate">{l.caption}</p>
                  </div>
                  <ExternalLink className="size-4 text-muted-foreground shrink-0" />
                </a>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </div>

      <ChangeDialog
        kind={changingKind}
        current={currentForDialog}
        onClose={() => setChangingKind(null)}
        onConfirm={async (amount) => {
          if (!changingKind) return;
          await changing.mutateAsync({ kind: changingKind, amount });
        }}
      />
    </ScreenLayout>
  );
};

export default AdminSettings;
