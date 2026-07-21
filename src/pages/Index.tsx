import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SplashScreen from "@/components/SplashScreen";
import HairStrandIcon from "@/components/HairStrandIcon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import LoadingDot from "@/components/LoadingDot";
import { supabase } from "@/integrations/supabase/client";

type Destination = { path: string; label: string; sub: string };

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("strand_last_display_name");
      if (stored) setFirstName(stored);
    } catch {}
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    setChecking(true);
    (async () => {
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select("onboarding_completed_at, display_name")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      const roles = (roleRows ?? []).map((r) => r.role as string);
      const hasConsumer = roles.includes("consumer");
      const hasPro = roles.includes("professional");
      const hasAdmin = roles.includes("admin");

      const consumerPath = profile?.onboarding_completed_at
        ? "/home"
        : "/onboarding/profile-step-1";

      const dests: Destination[] = [];
      if (hasConsumer)
        dests.push({ path: consumerPath, label: "Enter STRAND", sub: "Your personal hair journal" });
      if (hasPro)
        dests.push({ path: "/pro", label: "Professional dashboard", sub: "Clients & enquiries" });
      if (hasAdmin)
        dests.push({ path: "/admin/applications", label: "Admin dashboard", sub: "Applications, members & settings" });

      if (dests.length === 0) dests.push({ path: consumerPath, label: "Enter STRAND", sub: "Your personal hair journal" });

      setDestinations(dests);
      if (profile?.display_name) {
        const first = profile.display_name.split(" ")[0];
        setFirstName(first);
        try { localStorage.setItem("strand_last_display_name", first); } catch {}
      }
      setChecking(false);
    })();
  }, [loading, user]);

  if (loading || (user && checking)) return <LoadingDot />;

  if (user && destinations) {
    return (
      <>
        <title>STRAND — Welcome back</title>
        <div className="flex flex-col h-full px-7 pb-8 bg-background">
          <div className="flex flex-col items-center justify-center flex-1 pt-8 gap-8">
            <div className="flex flex-col items-center text-center">
              <HairStrandIcon className="w-16 h-16 text-primary mb-6" />
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
                  await supabase.auth.signOut();
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
