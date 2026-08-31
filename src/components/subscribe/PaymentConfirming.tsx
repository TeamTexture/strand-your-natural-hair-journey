import { Loader2, RefreshCw } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";

interface Props {
  /** True once the polling window has been exhausted without confirmation. */
  stalled: boolean;
  /** Trial wording vs straight membership wording. */
  trial?: boolean;
  /** Re-check entitlement without starting a new checkout session. */
  onCheckAgain: () => void;
  /** True while a manual re-check is in flight. */
  checking?: boolean;
}

/**
 * Shown for the whole time `?checkout=success` is on the URL and entitlement is
 * not yet confirmed.
 *
 * The paywall CTA is deliberately unreachable here: she has already paid, and a
 * second tap would create a second Stripe checkout session at full price
 * (the first one has already set `stripe_subscription_id`, so the trial no
 * longer applies). The only actions offered are waiting and re-checking.
 */
const PaymentConfirming = ({ stalled, trial, onCheckAgain, checking }: Props) => (
  <ScreenLayout>
    <div className="flex flex-col items-center justify-center h-full gap-4 px-7 text-center">
      {stalled ? (
        <RefreshCw className="size-6 text-primary" />
      ) : (
        <Loader2 className="size-6 animate-spin text-primary" />
      )}

      {!stalled ? (
        <>
          <p className="font-display text-[20px] leading-tight text-foreground">
            Confirming your payment…
          </p>
          <p className="font-body text-[13px] leading-relaxed text-foreground/70 max-w-[280px]">
            Your card details are with our payment provider. This can take up to a minute — please
            don&apos;t close this screen or pay again.
          </p>
        </>
      ) : (
        <SurfaceCard className="w-full space-y-3 text-left">
          <p className="font-display text-[19px] leading-tight text-foreground">
            Your payment went through
          </p>
          <p className="font-body text-[13px] leading-relaxed text-foreground/70">
            We&apos;re still waiting for confirmation from our payment provider. Nothing is lost and
            you have not been charged twice.{" "}
            <span className="font-semibold text-foreground">
              Please refresh this page in a moment
            </span>{" "}
            — do not pay again.
          </p>
          <Button
            variant="gold"
            size="pill"
            className="w-full"
            onClick={onCheckAgain}
            disabled={checking}
          >
            {checking ? <Loader2 className="size-4 animate-spin" /> : "Check again"}
          </Button>
          <p className="font-body text-[11.5px] text-muted-foreground">
            {trial
              ? "Still stuck after a refresh? Email support@teamtexture.co.uk and we'll activate your trial by hand."
              : "Still stuck after a refresh? Email support@teamtexture.co.uk and we'll sort it straight away."}
          </p>
        </SurfaceCard>
      )}
    </div>
  </ScreenLayout>
);

export default PaymentConfirming;
