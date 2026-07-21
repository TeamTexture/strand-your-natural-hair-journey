import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import HairStrandIcon from "@/components/HairStrandIcon";
import { Button } from "@/components/ui/button";
import SurfaceCard from "@/components/SurfaceCard";
import { LogOut, Mail } from "lucide-react";

type AppRow = {
  id: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  payment_confirmed_at: string | null;
  full_name: string;
  discipline: string;
  created_at: string;
};

/**
 * Post-signup landing for professionals. Behaviour by state:
 * - Approved pros → immediately redirected to /pro dashboard.
 * - Paid, submitted application → "Application received" pending screen.
 * - Rejected → respectful declined screen with contact.
 * - Draft (unpaid) or nothing yet → simple welcome with Apply CTA.
 */
const ProLanding = () => {
  const nav = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const { isProfessional, loading: rolesLoading } = useRoles();

  useEffect(() => {
    if (!authLoading && !user) nav("/pro/auth", { replace: true });
  }, [authLoading, user, nav]);

  // Approved pros go straight to the dashboard.
  useEffect(() => {
    if (!rolesLoading && isProfessional) nav("/pro", { replace: true });
  }, [rolesLoading, isProfessional, nav]);

  const { data: latest, isLoading: appLoading } = useQuery({
    queryKey: ["pro_application", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AppRow | null> => {
      const { data, error } = await supabase
        .from("pro_applications")
        .select("id, status, payment_confirmed_at, full_name, discipline, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as AppRow | null) ?? null;
    },
  });

  if (authLoading || rolesLoading || appLoading) return <LoadingDot />;
  if (!user) return null;

  const paid = latest?.payment_confirmed_at != null;
  const submittedPending = paid && latest?.status === "pending";
  const rejected = paid && latest?.status === "rejected";
  const displayName = latest?.full_name || user.email?.split("@")[0] || "Practitioner";

  const submittedDate = latest?.payment_confirmed_at
    ? new Date(latest.payment_confirmed_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <ScreenLayout>
      <TitleBar title="STRAND Pro" back={false} />
      <div className="px-6 pt-2 pb-10 space-y-6">
        <div className="flex flex-col items-center text-center pt-2">
          <HairStrandIcon className="w-10 h-10 text-primary mb-3" />
          <p className="font-display italic text-[11px] uppercase tracking-[0.25em] text-foreground/70">
            The Strand Council
          </p>
          <h2 className="font-display text-2xl font-semibold text-foreground mt-1.5">
            {submittedPending ? "Application received" : rejected ? "Application closed" : `Welcome, ${displayName.split(" ")[0]}`}
          </h2>
          {latest?.discipline && !submittedPending && !rejected && (
            <p className="font-body text-[12px] uppercase tracking-[0.15em] text-primary mt-1.5">
              {latest.discipline}
            </p>
          )}
        </div>

        {submittedPending && (
          <SurfaceCard tone="gold" className="!p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-body font-bold uppercase tracking-[0.18em] text-primary">
                Under review
              </span>
              {submittedDate && (
                <span className="text-[10px] font-body text-foreground/60">
                  Submitted {submittedDate}
                </span>
              )}
            </div>
            <p className="font-body text-sm text-foreground/85 leading-relaxed">
              Thank you for applying. Your application is with the Strand Council. We'll
              be in touch once your application has been reviewed.
            </p>
            <a
              href="mailto:info@teamtexture.co.uk"
              className="inline-flex items-center gap-1.5 text-[12px] font-body text-primary underline underline-offset-2"
            >
              <Mail className="size-3.5" /> Questions? info@teamtexture.co.uk
            </a>
          </SurfaceCard>
        )}

        {rejected && (
          <SurfaceCard className="!p-5 space-y-3">
            <span className="text-[10px] font-body font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Declined
            </span>
            <p className="font-body text-sm text-foreground/85 leading-relaxed">
              After careful consideration, your application wasn't accepted at this
              time. Your subscription has been cancelled. We'd love to hear from you if
              your practice evolves — please reach out any time.
            </p>
            <a
              href="mailto:info@teamtexture.co.uk"
              className="inline-flex items-center gap-1.5 text-[12px] font-body text-primary underline underline-offset-2"
            >
              <Mail className="size-3.5" /> info@teamtexture.co.uk
            </a>
          </SurfaceCard>
        )}

        {!submittedPending && !rejected && (
          <>
            <SurfaceCard className="!p-5 space-y-3">
              <p className="font-display italic text-[15px] text-foreground leading-relaxed">
                Join a hand-vetted directory of practitioners championing textured hair.
              </p>
              <ul className="text-[13px] font-body text-foreground/80 space-y-1.5 pt-1">
                <li>· Featured in the STRAND directory</li>
                <li>· Receive enquiries with pre-populated client context</li>
                <li>· Access consented client passports</li>
                <li>· Profile, offers, photos</li>
              </ul>
            </SurfaceCard>

            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={() => nav("/pro/apply")}
            >
              {latest ? "Continue application →" : "Apply to join the Strand Council →"}
            </Button>

            <p className="text-[11px] text-foreground/60 font-body text-center leading-relaxed">
              Applications include payment for STRAND Pro membership. You'll only be
              charged once — access unlocks after review.
            </p>
          </>
        )}

        <div className="pt-4 flex justify-center">
          <button
            onClick={async () => {
              await signOut();
              nav("/pro/auth", { replace: true });
            }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </div>
    </ScreenLayout>
  );
};

export default ProLanding;
