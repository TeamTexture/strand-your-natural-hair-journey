import { Link, useNavigate } from "react-router-dom";
import { Lock, FileDown, HelpCircle } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";

/**
 * What a lapsed member sees instead of a silent bounce to the paywall.
 *
 * Nothing has been deleted — their profile, blood history, shelf, journal and
 * plans stay exactly as they were and come straight back on resubscribing.
 */
const MembershipEnded = ({ next }: { next?: string }) => {
  const navigate = useNavigate();
  const { subscription } = useConsumerSubscription();
  const endedOn = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const resubscribe = next
    ? `/subscribe?next=${encodeURIComponent(next)}`
    : "/subscribe";

  return (
    <ScreenLayout>
      <TitleBar title="Membership" />
      <div className="px-5 pb-12 space-y-4">
        <SurfaceCard className="space-y-3">
          <div className="size-11 rounded-full bg-primary/12 text-primary flex items-center justify-center">
            <Lock className="size-5" />
          </div>
          <h1 className="font-display text-[22px] leading-tight">Your membership has ended</h1>
          <p className="font-body text-[13px] leading-relaxed text-foreground/80">
            {endedOn
              ? `Your STRAND membership ran to ${endedOn}, so the app is paused for now.`
              : "Your STRAND membership is no longer active, so the app is paused for now."}{" "}
            Everything you have added — your profile, blood history, shelf, journal and any
            treatment plans — is kept safely and comes straight back when you resubscribe.
          </p>
          <Button variant="gold" size="pill" className="w-full" onClick={() => navigate(resubscribe)}>
            Resubscribe
          </Button>
        </SurfaceCard>

        <SurfaceCard className="space-y-3">
          <h2 className="font-display text-[16px] leading-tight">Your data, either way</h2>
          <p className="font-body text-[12.5px] leading-relaxed text-foreground/75">
            You can download or request a copy of everything we hold at any time, membership or
            not.
          </p>
          <Link to="/profile/data-access" className="block">
            <Button variant="outline" size="pill" className="w-full gap-2">
              <FileDown className="size-4" /> Your data
            </Button>
          </Link>
          <Link to="/help" className="block">
            <Button variant="ghost" size="pill" className="w-full gap-2">
              <HelpCircle className="size-4" /> Get help
            </Button>
          </Link>
        </SurfaceCard>

        <p className="font-body text-[11px] text-center text-muted-foreground">
          Questions about your membership? Email support@teamtexture.co.uk.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default MembershipEnded;
