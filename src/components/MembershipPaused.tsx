import { Link } from "react-router-dom";
import { PauseCircle, PlayCircle, ShieldCheck } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useResumeMembership } from "@/hooks/useAccountLifecycle";

/**
 * What a paused member sees instead of a silent bounce.
 *
 * Stripe leaves a paused subscription's status as `active`, so entitlement reads
 * the persisted pause flag — see `lib/entitlement`. While paused there is no app
 * access, and nothing at all is deleted.
 */
const MembershipPaused = () => {
  const { pauseResumesAt } = useConsumerSubscription();
  const resume = useResumeMembership();

  const resumesOn = pauseResumesAt
    ? new Date(pauseResumesAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <ScreenLayout>
      <TitleBar title="Membership" />
      <div className="px-5 pb-12 space-y-4">
        <SurfaceCard className="space-y-3">
          <div className="size-11 rounded-full bg-primary/12 text-primary flex items-center justify-center">
            <PauseCircle className="size-5" />
          </div>
          <h1 className="font-display text-[22px] leading-tight">Your membership is paused</h1>
          <p className="font-body text-[13px] leading-relaxed text-foreground/80">
            You paused your membership, so we are not taking payment and the app is on hold.
            {resumesOn ? ` Collection is set to restart on ${resumesOn}.` : ""} Everything you
            have added — your profile, blood history, shelf, journal and any treatment plans —
            is exactly as you left it.
          </p>
          <Button
            variant="gold"
            size="pill"
            className="w-full gap-2"
            disabled={resume.isPending}
            onClick={() =>
              resume.mutate(undefined, {
                onSuccess: () => toast("Membership resumed — welcome back"),
                onError: (e) =>
                  toast.error(e instanceof Error ? e.message : "Could not resume"),
              })
            }
          >
            <PlayCircle className="size-4" />
            {resume.isPending ? "Resuming…" : "Resume my membership"}
          </Button>
          <p className="font-body text-[11.5px] text-muted-foreground leading-snug">
            Resuming takes effect straight away and your next payment picks up from your normal
            billing date.
          </p>
        </SurfaceCard>

        <SurfaceCard className="space-y-3">
          <h2 className="font-display text-[16px] leading-tight">Your data while paused</h2>
          <p className="font-body text-[12.5px] leading-relaxed text-foreground/75">
            Nothing is deleted while your membership is paused. You can still download a copy of
            what we hold, or ask us to erase your account, from your data settings.
          </p>
          <Link to="/profile/data-access" className="block">
            <Button variant="outline" size="pill" className="w-full gap-2">
              <ShieldCheck className="size-4" /> Data and account settings
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

export default MembershipPaused;
