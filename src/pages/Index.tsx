import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SplashScreen from "@/components/SplashScreen";
import HairStrandIcon from "@/components/HairStrandIcon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import LoadingDot from "@/components/LoadingDot";
import { supabase } from "@/integrations/supabase/client";
import {
  getBrandEntryPath,
  getConsumerAccessForUser,
  getConsumerOnboardingStatus,
  getSubscribePath,
} from "@/lib/consumerOnboarding";
import { recoveryLockPath } from "@/lib/recoveryLock";

type Destination = { path: string; label: string; sub: string };

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);


  useEffect(() => {
    if (loading || !user) return;
    // Mid password-reset: never route an unproven recovery session into the app.
    const lockPath = recoveryLockPath();
    if (lockPath) {
      navigate(lockPath, { replace: true });
      return;
    }
    setChecking(true);
    (async () => {
      try {
      const [{ data: profile }, { data: roleRows }, { data: proApp }, { data: brandProf }, onboardingStatus] = await Promise.all([
        supabase
          .from("profiles")
          .select("onboarding_completed_at, display_name")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase
          .from("pro_applications")
          .select("id, status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("brand_profiles")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle(),
        getConsumerOnboardingStatus(user.id),
      ]);
      const roles = (roleRows ?? []).map((r) => r.role as string);
      const hasConsumer = roles.includes("consumer");
      const hasPro = roles.includes("professional");
      const hasAdmin = roles.includes("admin");
      const hasBrand = roles.includes("brand");

      // A deep link that bounced through the auth gate (?next=…) wins for
      // staff accounts — e.g. an admin notification email pointing at one
      // message. Same-origin paths only.
      const rawNext = new URLSearchParams(window.location.search).get("next");
      const deepLink =
        rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
      if (deepLink && (hasAdmin || hasPro)) {
        navigate(deepLink, { replace: true });
        return;
      }



      // Pro-intent shortcut: applicants (not yet approved) skip consumer
      // onboarding entirely and land on the pro landing screen.
      if (proApp && !hasPro && !hasAdmin && !hasBrand) {
        navigate("/pro/landing", { replace: true });
        return;
      }

      // Professionals live entirely on the pro side — no consumer choice.
      // /pro/landing routes on to the acceptance+payment screen or dashboard.
      if (hasPro && !hasAdmin) {
        navigate("/pro/landing", { replace: true });
        return;
      }

      // Brand accounts skip the consumer onboarding/paywall entirely. The
      // default consumer role can still exist on older accounts, so don't use
      // it as evidence that this is an end-user login. The brand role alone is
      // enough — waiting on a brand_profiles row sent brand-new brands down
      // the consumer membership splash instead of the £99/year access page.
      if (hasBrand && !hasPro && !hasAdmin) {
        navigate(await getBrandEntryPath(user.id, roles), { replace: true });
        return;
      }

      // Brand-intent signup whose role hasn't been provisioned yet (email
      // confirmation flow): route via the brand auth surface, which finishes
      // provisioning and then sends them to the access page.
      if (!hasBrand && !hasPro && !hasAdmin && (brandProf || user.user_metadata?.brand_intent)) {
        navigate("/brand/auth?mode=signin", { replace: true });
        return;
      }

      const hasAccess = await getConsumerAccessForUser(user.id, roles);
      const consumerPath = onboardingStatus.completed
        ? hasAccess
          ? "/home"
          : getSubscribePath(onboardingStatus.analysisPath)
        : onboardingStatus.healthComplete
          ? // Hair characteristics / blood work outstanding: offer both, resuming
            // exactly where she stopped rather than restarting the section.
            "/onboarding/resume"
          : onboardingStatus.resumePath;

      const dests: Destination[] = [];
      if (hasConsumer)
        dests.push({ path: consumerPath, label: "Enter STRAND", sub: "Your personal hair journal" });
      if (hasPro)
        dests.push({ path: "/pro", label: "Professional dashboard", sub: "Clients & enquiries" });
      if (hasBrand)
        dests.push({ path: "/brand", label: "Brand dashboard", sub: "Offers & placements" });
      if (hasAdmin)
        dests.push({ path: "/admin", label: "Admin dashboard", sub: "Applications, members & settings" });

      if (dests.length === 0) dests.push({ path: consumerPath, label: "Enter STRAND", sub: "Your personal hair journal" });

      setDestinations(dests);
      // Personalisation is derived from the live session only — never cached
      // to localStorage, so a signed-out visitor sees no name at all.
      if (profile?.display_name) {
        setFirstName(profile.display_name.split(" ")[0]);
      }
      } catch (error: unknown) {
        // Email confirmations and old bookmarks often arrive during a brief
        // network/auth refresh. Never strand the member on an empty loader:
        // this safe entry is subsequently corrected to their earliest
        // incomplete step by OnboardingGate.
        console.error("[welcome] couldn't resolve account destination", error);
        setDestinations([
          {
            path: "/onboarding/profile-step-1",
            label: "Continue setting up STRAND",
            sub: "Your saved answers are still here",
          },
        ]);
      } finally {
        setChecking(false);
      }
    })();
  }, [loading, user, navigate]);

  if (loading || (user && checking)) return <LoadingDot />;

  if (user && destinations) {
    return (
      <>
        <title>STRAND — Welcome back</title>
        <div className="flex flex-col h-full px-7 pb-8 bg-background">
          <div className="flex flex-col items-center justify-center flex-1 pt-8 gap-8">
            <div className="flex flex-col items-center text-center">
              <HairStrandIcon className="h-16 w-auto text-primary mb-6" />
              <h1 className="font-display text-primary text-6xl font-semibold tracking-strand uppercase">
                Strand
              </h1>
              <div className="mt-6 max-w-[260px] text-foreground/75 text-sm leading-relaxed space-y-1">
                <p>
                  Built with insights from
                  <br />
                  <span className="font-display italic text-foreground text-base">
                    "How To Love Your Afro"
                  </span>
                </p>
                {firstName && (
                  <p className="font-body text-foreground text-base pt-2">
                    Welcome back {firstName}
                  </p>
                )}
              </div>
            </div>

            <div className="w-full flex flex-col gap-3">
              {destinations.map((d) => (
                <Button
                  key={d.path}
                  variant="gold"
                  size="pill"
                  onClick={() => navigate(d.path, { replace: true })}
                  className="flex-col h-auto py-3"
                >
                  <span>{d.label} →</span>
                  <span className="text-[11px] font-normal opacity-80">{d.sub}</span>
                </Button>
              ))}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await supabase.auth.signOut();
                  } catch (e) {
                    console.error("[sign out] failed", e);
                  }
                }}
                className="mt-1 text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Not you? Sign out
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <title>STRAND — Hair Journal for TT Collective Pro</title>
      <meta
        name="description"
        content="STRAND: a hair journal and clinical companion for women on a natural hair care journey. Exclusive to TT Collective Pro members."
      />
      <SplashScreen />
    </>
  );
};

export default Index;
