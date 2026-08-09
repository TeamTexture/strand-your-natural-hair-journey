import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";
import HairStrandIcon from "./HairStrandIcon";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getBrandEntryPath,
  getConsumerAccessForUser,
  getConsumerOnboardingStatus,
  getSubscribePath,
} from "@/lib/consumerOnboarding";

const safeNext = (raw: string | null, fallback: string) => {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
};

const SplashScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("strand_last_display_name");
      if (stored) setFirstName(stored);
    } catch {
      // Ignore private browsing/storage failures.
    }
  }, []);

  const nextParam = searchParams.get("next");
  const next = safeNext(nextParam, "/home");

  const getPostSignInTarget = async (userId: string) => {
    const [{ data: roleRows }, { data: brandProfile }, { data: proApp }, onboardingStatus] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("brand_profiles").select("id").eq("user_id", userId).maybeSingle(),
      supabase
        .from("pro_applications")
        .select("id, status")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getConsumerOnboardingStatus(userId),
    ]);

    const roles = (roleRows ?? []).map((row) => row.role as string);
    // Deep links (e.g. an admin notification email) must survive the login hop.
    if (roles.includes("admin") || roles.includes("professional")) {
      return nextParam ? safeNext(nextParam, "/") : "/";
    }

    if ((roles.includes("brand") || brandProfile) && !roles.includes("admin") && !roles.includes("professional")) {
      return getBrandEntryPath(userId, roles);
    }
    if (proApp) return "/pro/landing";
    if (!onboardingStatus.completed) return onboardingStatus.resumePath;
    const hasAccess = await getConsumerAccessForUser(userId, roles);
    if (!hasAccess) return getSubscribePath(onboardingStatus.analysisPath);
    return next;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || password.length < 6) {
      toast.error("Enter a valid email and a 6+ character password.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      setFailedAttempts(0);
      toast.success("Signed in");
      const target = data.user?.id ? await getPostSignInTarget(data.user.id) : "/";
      navigate(target, { replace: true });
    } catch (err: unknown) {
      setFailedAttempts((n) => n + 1);
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full px-7 pb-8 bg-background">
      <div className="flex flex-col items-center justify-center flex-1 pt-8 gap-8">
        {/* Logo block */}
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
              <p className="font-body text-foreground text-base">
                Welcome back {firstName}
              </p>
            )}
          </div>
        </div>

        {/* Sign-in form */}
        <form onSubmit={submit} className="w-full flex flex-col gap-3 selectable">
        <div className="space-y-1.5">
          <Label
            htmlFor="splash-email"
            className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
          >
            Email
          </Label>
          <Input
            id="splash-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="splash-password"
            className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
          >
            Password
          </Label>
          <PasswordInput
            id="splash-password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </div>

        <Button variant="gold" size="pill" type="submit" disabled={loading}>
          {loading ? "Please wait…" : "Sign In"}
        </Button>

        <button
          type="button"
          onClick={() => navigate("/forgot-password")}
          className="text-xs text-muted-foreground hover:text-foreground text-center underline underline-offset-4"
        >
          Forgot your password?
        </button>

        {failedAttempts >= 3 && (
          <div className="rounded-2xl border border-primary/50 bg-primary/5 px-4 py-3 text-center space-y-2">
            <p className="text-xs text-foreground">
              Having trouble signing in? You can reset your password.
            </p>
            <Button
              type="button"
              variant="gold"
              size="pill"
              onClick={() => navigate("/forgot-password")}
            >
              Reset my password
            </Button>
          </div>
        )}



        <div className="mt-5 pt-5 border-t border-border/60 space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground text-center">
            New here? Choose your account
          </p>

          <button
            type="button"
            onClick={() => {
              const qs = nextParam ? `?next=${encodeURIComponent(nextParam)}` : "";
              navigate(`/auth${qs}`);
            }}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-primary/60 transition-colors"
          >
            <span className="block font-body text-sm text-foreground">Member</span>
            <span className="block text-[11px] text-muted-foreground">
              Your personal hair journal
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/pro/auth")}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-primary/60 transition-colors"
          >
            <span className="block font-body text-sm text-foreground">Professional</span>
            <span className="block text-[11px] text-muted-foreground">
              Apply to join the directory
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/brand/auth")}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-primary/60 transition-colors"
          >
            <span className="block font-body text-sm text-foreground">Brand</span>
            <span className="block text-[11px] text-muted-foreground">
              Place offers with STRAND
            </span>
          </button>
        </div>

      </form>
      </div>
    </div>
  );
};

export default SplashScreen;
