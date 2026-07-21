import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import HairStrandIcon from "@/components/HairStrandIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// Only allow same-origin relative paths for redirect to avoid open-redirect
// attacks via crafted ?next=https://evil.com links.
const safeNext = (raw: string | null, fallback: string) => {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
};

const Auth = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Default returning users to /home; new signups are routed to onboarding below.
  const next = safeNext(params.get("next"), "/home");
  const urlMode = params.get("mode");
  const [mode, setMode] = useState<"signin" | "signup">(
    urlMode === "signin" ? "signin" : "signup",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const { user, loading: authLoading } = useAuth();
  useEffect(() => {
    if (!authLoading && user) {
      // If already signed in, send to the welcome gate so multi-role users
      // (consumer + pro + admin) can pick which area to enter.
      (async () => {
        const { data } = await supabase
          .from("profiles")
          .select("onboarding_completed_at")
          .eq("user_id", user.id)
          .maybeSingle();
        const nextParam = params.get("next");
        const target = data?.onboarding_completed_at
          ? (nextParam ? safeNext(nextParam, "/") : "/")
          : "/onboarding/profile-step-1";
        navigate(target, { replace: true });
      })();
    }
  }, [authLoading, user, navigate, params]);


  const passwordsMatch = mode !== "signup" || password === confirmPassword;
  const canSubmit =
    !loading &&
    email.length > 0 &&
    password.length >= 6 &&
    (mode !== "signup" || (confirmPassword.length >= 6 && passwordsMatch));

  const sendResetEmail = async (targetEmail: string) => {
    if (!targetEmail) {
      toast.error("Enter your email first, then tap Forgot password.");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset email sent — check your inbox.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't send reset email";
      toast.error(msg);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || password.length < 6) {
      toast.error("Enter a valid email and a 6+ character password.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) {
          // Supabase returns "User already registered" when the email is
          // already attached to a confirmed account. Convert to a friendly
          // message and flip the form to sign-in so the user isn't stuck.
          const msg = error.message?.toLowerCase() ?? "";
          if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
            toast.error("An account already exists for this email. Please sign in.");
            setMode("signin");
            setConfirmPassword("");
            return;
          }
          throw error;
        }
        // When email confirmation is enabled, Supabase obfuscates existing
        // accounts by returning a user with an empty `identities` array
        // rather than an error. Treat that as "email already registered".
        const identities = data.user?.identities ?? [];
        if (data.user && identities.length === 0) {
          toast.error("An account already exists for this email. Please sign in.", {
            action: {
              label: "Reset password",
              onClick: () => sendResetEmail(email),
            },
            duration: 10000,
          });
          setMode("signin");
          setConfirmPassword("");
          return;
        }
        const uid = data.user?.id;
        if (uid) {
          localStorage.setItem(`strand_setup_pending:${uid}`, "true");
        }
        toast.success("Welcome to Strand");
        navigate("/setup", { replace: true });
        return;
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
        // After sign-in, check onboarding status so completed users go straight to /home.
        const uid = signInData.user?.id;
        if (uid) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("onboarding_completed_at")
            .eq("user_id", uid)
            .maybeSingle();
          if (prof?.onboarding_completed_at) {
            navigate(safeNext(params.get("next"), "/home"), { replace: true });
            return;
          }
          navigate("/onboarding/profile-step-1", { replace: true });
          return;
        }
      }
      navigate(next, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title={mode === "signup" ? "Create your account" : "Welcome back"} back />
      <div className="px-7 pt-2 pb-10 flex flex-col h-full">
        <div className="flex flex-col items-center text-center mb-8">
          <HairStrandIcon className="w-12 h-12 text-primary mb-4" />
          <p className="font-body text-base text-muted-foreground max-w-[260px] leading-snug">
            Your verified hair journal — built around your clinical data.
          </p>
        </div>

        {mode === "signup" && (
          <div className="mb-5 rounded-[14px] border border-primary/40 bg-primary/5 p-3.5">
            <p className="text-[12.5px] font-semibold text-foreground leading-snug">
              STRAND unlocks with two things on file:
            </p>
            <ul className="mt-1.5 text-[12px] text-foreground/85 leading-snug space-y-0.5 font-body">
              <li>• A blood test within the last 3 months</li>
              <li>• A professional hair consultation within the last 3 months</li>
            </ul>
            <button
              type="button"
              onClick={() => navigate("/directory")}
              className="mt-2 text-primary text-[12px] font-semibold underline underline-offset-2"
            >
              Not there yet? Browse verified professionals →
            </button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4 selectable">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Password</Label>
            <PasswordInput
              id="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>

          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Confirm password</Label>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                aria-invalid={confirmPassword.length > 0 && !passwordsMatch}
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-[11px] text-destructive font-body" role="alert">
                  Passwords don't match
                </p>
              )}
            </div>
          )}

          <Button variant="gold" size="pill" type="submit" disabled={!canSubmit}>
            {loading ? "Please wait…" : mode === "signup" ? "Create Account →" : "Sign In →"}
          </Button>
        </form>


        {mode === "signin" && (
          <button
            type="button"
            onClick={() => sendResetEmail(email)}
            className="mt-4 text-center text-xs text-primary hover:underline"
          >
            Forgot password? Send reset email
          </button>
        )}

        <button
          type="button"
          onClick={() => setMode((m) => (m === "signup" ? "signin" : "signup"))}
          className="mt-5 text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New to Strand? Create an account"}
        </button>
      </div>
    </ScreenLayout>
  );
};

export default Auth;
