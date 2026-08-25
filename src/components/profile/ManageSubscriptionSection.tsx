import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, CreditCard, PauseCircle, PlayCircle, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import {
  useBillingPortal,
  usePauseMembership,
  useResumeMembership,
} from "@/hooks/useAccountLifecycle";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

const PLUS_PRICE = 14.99;

const formatLong = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
};

/** One tappable row inside the section. */
const ActionRow = ({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
}: {
  icon: typeof CreditCard;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "w-full text-left flex items-center gap-3 rounded-[12px] border border-border bg-card px-3.5 py-3 min-w-0 transition-colors",
      disabled ? "opacity-60" : "hover:border-primary/50 hover:bg-primary/5",
    )}
  >
    <span className="size-8 shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center">
      <Icon className="size-4" />
    </span>
    <span className="flex-1 min-w-0">
      <span className="block font-body text-[14px] font-medium leading-tight text-foreground">
        {title}
      </span>
      <span className="block font-body text-[12px] leading-snug text-muted-foreground mt-0.5">
        {description}
      </span>
    </span>
  </button>
);

/**
 * Billing self-service on the consumer Profile screen: plan state, plan change,
 * pause / resume and cancel-at-period-end.
 *
 * Pause and resume call `consumer-pause-subscription`, which updates Stripe's
 * `pause_collection`; the webhook mirrors that state into the database. Plan
 * changes and cancellation open Stripe Billing Portal deep-link flows.
 */
const ManageSubscriptionSection = () => {
  const navigate = useNavigate();
  const { subscription, paused, pauseResumesAt, complimentary, isLoading } =
    useConsumerSubscription();
  const pause = usePauseMembership();
  const resume = useResumeMembership();
  const portal = useBillingPortal();

  const [pauseOpen, setPauseOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const basePriceQ = useQuery({
    queryKey: ["platform_settings", "consumer_monthly_price_gbp"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "consumer_monthly_price_gbp")
        .maybeSingle();
      const raw = (data?.value as number | string | null) ?? 9.99;
      const n = typeof raw === "string" ? parseFloat(raw) : raw;
      return Number.isFinite(n) ? n : 9.99;
    },
  });

  if (isLoading) return null;

  const hasStripe = !!subscription?.stripe_customer_id && !!subscription?.stripe_subscription_id;
  const tier = subscription?.tier === "plus" ? "plus" : "standard";
  const isPlus = tier === "plus";
  const planName = isPlus ? "STRAND Plus" : "STRAND";
  const price = isPlus ? PLUS_PRICE : (basePriceQ.data ?? 9.99);
  const cancelling = !!subscription?.cancel_at_period_end;
  const renews = formatLong(subscription?.current_period_end);
  const resumesOn = formatLong(pauseResumesAt);
  const status = (subscription?.status ?? "none").toLowerCase();

  const pill: { label: string; tone: string } = complimentary
    ? { label: "Complimentary", tone: "bg-primary/15 text-primary border-primary/30" }
    : paused
      ? { label: "Paused", tone: "bg-warn/15 text-warn border-warn/40" }
      : cancelling
        ? { label: "Cancelling", tone: "bg-warn/15 text-warn border-warn/40" }
        : status === "trialing"
          ? { label: "Trialing", tone: "bg-primary/15 text-primary border-primary/30" }
          : status === "active"
            ? { label: "Active", tone: "bg-good/15 text-good border-good/40" }
            : { label: "Cancelled", tone: "bg-muted text-muted-foreground border-border" };

  const stateLine = complimentary
    ? "Complimentary access · no payment taken"
    : paused
      ? resumesOn
        ? `Paused · billing resumes ${resumesOn}`
        : "Paused · billing stopped until you resume"
      : cancelling
        ? renews
          ? `£${price.toFixed(2)} a month · access runs to ${renews}`
          : `£${price.toFixed(2)} a month · cancelling at the end of this period`
        : renews
          ? `£${price.toFixed(2)} a month · renews ${renews}`
          : `£${price.toFixed(2)} a month`;

  const openPortal = (label: string, flow: "subscription_update" | "subscription_cancel" | "portal") =>
    portal.mutate({ returnPath: "/profile", flow }, {
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : `Could not open ${label}`),
    });

  return (
    <div className="px-5 pb-4">
      <div className="rounded-[14px] border border-border bg-card p-4 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="size-[26px] shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <CreditCard className="size-3.5" />
          </span>
          <h2 className="font-display text-[17px] font-bold leading-tight text-foreground min-w-0 flex-1">
            Manage subscription
          </h2>
        </div>
        <div className="mt-3 mb-3.5 h-px bg-gradient-to-r from-primary to-transparent" />

        {/* Current state */}
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex-1 min-w-0">
            <p className="font-body text-[15px] font-semibold leading-tight text-foreground truncate">
              {planName}
            </p>
            <p className="font-body text-[12px] leading-snug text-muted-foreground mt-0.5">
              {stateLine}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 font-body text-[10.5px] font-semibold uppercase tracking-[0.1em]",
              pill.tone,
            )}
          >
            {pill.label}
          </span>
        </div>

        {complimentary || !hasStripe ? (
          <p className="font-body text-[11.5px] leading-snug text-muted-foreground mt-3">
            {complimentary
              ? "Your access is complimentary, so there is nothing to pause or cancel. Nothing you have logged is ever deleted."
              : "Billing options appear here once you have a paid membership on file."}
          </p>
        ) : (
          <>
            <div className="mt-3.5 pt-3.5 border-t border-border space-y-2">
              <ActionRow
                icon={ArrowLeftRight}
                title="Change your plan"
                description="Move up or down a tier any time"
                onClick={() => openPortal("plan change", "subscription_update")}
                disabled={portal.isPending}
              />
              {paused ? (
                <ActionRow
                  icon={PlayCircle}
                  title="Resume your membership"
                  description={
                    resumesOn
                      ? `Billing resumes ${resumesOn} — or start again now`
                      : "Billing starts again and the app opens straight away"
                  }
                  onClick={() =>
                    resume.mutate(undefined, {
                      onSuccess: () => toast("Membership resumed"),
                      onError: (e) =>
                        toast.error(e instanceof Error ? e.message : "Could not resume"),
                    })
                  }
                  disabled={resume.isPending}
                />
              ) : (
                <ActionRow
                  icon={PauseCircle}
                  title="Pause your membership"
                  description="Stop billing, keep everything you've logged"
                  onClick={() => setPauseOpen(true)}
                  disabled={pause.isPending}
                />
              )}
              {cancelling ? (
                <ActionRow
                  icon={Undo2}
                  title="Keep your membership"
                  description={
                    renews
                      ? `Cancelling on ${renews} — turn it back on`
                      : "Turn your cancellation back off"
                  }
                  onClick={() => openPortal("the billing portal", "portal")}
                  disabled={portal.isPending}
                />
              ) : (
                <ActionRow
                  icon={XCircle}
                  title="Cancel your membership"
                  description={renews ? `Runs to ${renews}, then stops` : "Runs to the end of your paid period, then stops"}
                  onClick={() => setCancelOpen(true)}
                  disabled={portal.isPending}
                />
              )}
            </div>

            <p className="font-body text-[11.5px] leading-snug text-muted-foreground mt-3">
              Cancelling or pausing never deletes your hair record, wash days or blood results.
              They're waiting for you if you come back.
            </p>
          </>
        )}
      </div>

      {/* Pause confirmation */}
      <AlertDialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause your membership?</AlertDialogTitle>
            <AlertDialogDescription>
              We stop taking payment straight away and the app goes on hold until you resume.
              Nothing is deleted — your hair record, wash days, journal and blood results stay
              exactly as they are. Resume from this screen whenever you like and everything comes
              back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <Button
              variant="gold"
              disabled={pause.isPending}
              onClick={() =>
                pause.mutate(undefined, {
                  onSuccess: () => {
                    setPauseOpen(false);
                    toast("Membership paused — resume whenever you like");
                  },
                  onError: (e) =>
                    toast.error(e instanceof Error ? e.message : "Could not pause"),
                })
              }
            >
              {pause.isPending ? "Pausing…" : "Pause my membership"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirmation */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your membership?</AlertDialogTitle>
            <AlertDialogDescription>
              {renews
                ? `You keep full access until ${renews}, the end of the period you have already paid for. Billing then stops and nothing further is taken.`
                : "You keep full access to the end of the period you have already paid for. Billing then stops and nothing further is taken."}
              {" "}
              Nothing is deleted — your hair record, wash days, journal and blood results are here
              if you come back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my membership</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={portal.isPending}
              onClick={() => openPortal("the cancellation page", "subscription_cancel")}
            >
              {portal.isPending ? "Opening…" : "Continue to cancel"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageSubscriptionSection;
