// Public landing screen for the "STRAND ADMIN has sent you a message" email.
//
// It resolves the recipient's real state and forwards her on. It is deliberately
// self-contained: it reads the SAME helpers the rest of the funnel reads and
// changes none of them, so the paywall / SplashScreen work happening elsewhere
// cannot conflict with it.
import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import HairStrandIcon from "@/components/HairStrandIcon";
import LoadingDot from "@/components/LoadingDot";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getConsumerAccessForUser, getConsumerOnboardingStatus } from "@/lib/consumerOnboarding";
import { getTrialOfferState } from "@/lib/trialOffer";
import { walledDestination } from "@/lib/trialWall";
import { openMessageDestination } from "@/lib/openMessageDestination";
import { setPendingMessageThread } from "@/lib/pendingMessageLink";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OpenMessage = () => {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const resolved = useRef(false);

  const rawThread = params.get("t");
  const threadId = rawThread && UUID.test(rawThread) ? rawThread : null;

  useEffect(() => {
    if (loading || resolved.current) return;
    resolved.current = true;

    (async () => {
      // Signed out: hand off with the existing ?next= convention.
      if (!user) {
        const decision = openMessageDestination({
          signedIn: false,
          threadId,
          walled: false,
          onboardingComplete: false,
        });
        if (decision.remember) setPendingMessageThread(threadId);
        nav(decision.path, { replace: true });
        return;
      }

      try {
        const [{ data: roleRows }, onboardingStatus] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", user.id),
          getConsumerOnboardingStatus(user.id),
        ]);
        const roles = (roleRows ?? []).map((r) => r.role as string);
        const isStaff =
          roles.includes("admin") || roles.includes("professional") || roles.includes("brand");

        let walled = false;
        let walledPath: string | null = null;
        if (!isStaff) {
          const hasAccess = await getConsumerAccessForUser(user.id, roles);
          if (!hasAccess) {
            const trialState = await getTrialOfferState(user.id);
            walled = trialState.walled;
            if (walled) {
              walledPath = walledDestination({
                basicComplete: onboardingStatus.basicComplete,
                goalCaptured: trialState.goalCaptured,
                acquisitionAnswered: onboardingStatus.acquisitionAnswered,
              });
            }
          }
        }

        const decision = openMessageDestination({
          signedIn: true,
          threadId,
          isStaff,
          walled,
          walledPath,
          onboardingComplete: onboardingStatus.completed,
          onboardingPath: onboardingStatus.entryPath,
        });
        if (decision.remember) setPendingMessageThread(threadId);
        nav(decision.path, { replace: true });
      } catch {
        // Never dead-end an email link: the inbox always exists.
        nav(threadId ? `/messages/${threadId}` : "/messages", { replace: true });
      }
    })();
  }, [loading, user, threadId, nav]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 bg-background px-8 text-center">
      <HairStrandIcon className="h-12 w-auto text-primary" />
      <h1 className="font-display text-primary text-3xl font-semibold tracking-strand uppercase">
        Strand
      </h1>
      <p className="font-body text-xs text-muted-foreground leading-snug max-w-[240px]">
        Opening your message from the STRAND team…
      </p>
      <LoadingDot />
    </div>
  );
};

export default OpenMessage;
