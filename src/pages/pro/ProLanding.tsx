import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { useProSubscription } from "@/hooks/useProSubscription";
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
 * - Approved pro + active subscription → dashboard.
 * - Approved pro without active sub → /pro/welcome (acceptance + subscribe).
 * - Submitted, still pending → "Application received" screen.
 * - Rejected → respectful declined screen.
 * - No application yet / draft → welcome + Apply CTA.
 */
const ProLanding = () => {
  const nav = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const { isProfessional, isAdmin, loading: rolesLoading } = useRoles();
  const { isActive, isLoading: subLoading } = useProSubscription();

  useEffect(() => {
    if (!authLoading && !user) nav("/pro/auth", { replace: true });
  }, [authLoading, user, nav]);

  // Approved pros → welcome (if unpaid) or dashboard (if paid).
  useEffect(() => {
    if (rolesLoading || subLoading) return;
    if (isAdmin && !isProfessional) return; // admins land normally
    if (isProfessional) {
      nav(isActive ? "/pro" : "/pro/welcome", { replace: true });
    }
  }, [rolesLoading, subLoading, isProfessional, isAdmin, isActive, nav]);

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

  if (authLoading || rolesLoading || subLoading || appLoading) return <LoadingDot />;
  if (!user) return null;

  const submitted = latest?.payment_confirmed_at != null;
  const submittedPending = submitted && latest?.status === "pending";
  const rejected = submitted && latest?.status === "rejected";
  const displayName = latest?.full_name?.trim() || "Practitioner";

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
            {submittedPending
              ? "Application received"
              : rejected
                ? "Application closed"
                : `Welcome, ${displayName.split(" ")[0]}`}
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
              time. We'd love to hear from you if your practice evolves — please reach
              out any time.
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
              <p className="font-body text-[14px] text-foreground leading-relaxed">
                Join a hand-vetted directory of practitioners championing textured hair — and get matched with serious, informed clients who are already invested in their journey.
              </p>
              <p className="text-[10px] font-body font-bold uppercase tracking-[0.18em] text-primary pt-1">
                What you get
              </p>
              <ul className="text-[13px] font-body text-foreground/85 space-y-2">
                <li>
                  <span className="font-semibold text-foreground">A featured listing</span> in the STRAND directory — seen by paying members actively searching for a practitioner.
                </li>
                <li>
                  <span className="font-semibold text-foreground">Serious, ready-to-book clients</span> — everyone on STRAND is a paying member committed to their hair care journey, not casual browsers.
                </li>
                <li>
                  <span className="font-semibold text-foreground">Enquiries with full context</span> — no cold emails. Each enquiry arrives with the client's goals, hair type, concerns and history already attached.
                </li>
                <li>
                  <span className="font-semibold text-foreground">The client passport</span> — with consent, view their complete profile: bio, hair and health profile, colour and chemical history, blood work, current products and tools, wash-day patterns, appointment log and progress photos.
                </li>
                <li>
                  <span className="font-semibold text-foreground">Better consultations, less guesswork</span> — arrive to every appointment already knowing the client's story, so your chair time is spent on the work, not the intake.
                </li>
                <li>
                  <span className="font-semibold text-foreground">Your professional page</span> — bio, discipline, location, portfolio photos and bookable offers, all curated on-brand.
                </li>
                <li>
                  <span className="font-semibold text-foreground">Council recognition</span> — a hand-vetted mark of trust that signals you're one of the practitioners STRAND stands behind.
                </li>
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
              No payment is taken at application. You'll only subscribe once accepted by
              the Strand Council.
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
