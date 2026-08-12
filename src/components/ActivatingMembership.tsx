import { Loader2, LifeBuoy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";

interface Props {
  /** True once verification has given up — shows the recovery actions. */
  stuck: boolean;
  onRetry: () => void;
}

/**
 * Holding screen shown between a successful Stripe payment and confirmed
 * access. A paid member is never redirected to the subscribe page — if
 * verification stalls they get a clear message, a retry, and a route to help.
 */
const ActivatingMembership = ({ stuck, onRetry }: Props) => {
  const nav = useNavigate();
  return (
    <ScreenLayout>
      <div className="px-6 pt-16 pb-10 flex flex-col items-center text-center">
        {!stuck && <Loader2 className="size-9 animate-spin text-primary" />}
        {stuck && <LifeBuoy className="size-9 text-primary" />}
        <SurfaceCard className="mt-6 w-full space-y-3">
          <h1 className="font-display text-[22px] leading-tight">
            {stuck ? "Your payment went through" : "Activating your membership…"}
          </h1>
          <p className="font-body text-[13.5px] text-foreground/70 leading-relaxed">
            {stuck
              ? "We've taken your payment but we're still waiting to confirm your membership. Nothing is lost — try again, or contact us and we'll sort it straight away."
              : "One moment while we confirm your payment with our payment provider."}
          </p>
          {stuck && (
            <div className="space-y-2 pt-1">
              <Button variant="gold" size="pill" className="w-full" onClick={onRetry}>
                Try again
              </Button>
              <Button
                variant="outline"
                size="pill"
                className="w-full"
                onClick={() => nav("/help")}
              >
                Get help
              </Button>
            </div>
          )}
        </SurfaceCard>
      </div>
    </ScreenLayout>
  );
};

export default ActivatingMembership;
