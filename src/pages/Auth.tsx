import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import HairStrandIcon from "@/components/HairStrandIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const Auth = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/onboarding/profile-step-1";
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  // If a session already exists (returning user with a persisted session),
  // skip the auth screen entirely — they shouldn't have to sign in again.
  const { user, loading: authLoading } = useAuth();
  useEffect(() => {
    if (!authLoading && user) {
      const target = params.get("next") || "/home";
      navigate(target, { replace: true });
    }
  }, [authLoading, user, navigate, params]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || password.length < 6) {
      toast.error("Enter a valid email and a 6+ character password.");
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
        if (error) throw error;
        // Mark this account as needing the home-screen setup guide on first entry.
        const uid = data.user?.id;
        if (uid) {
          localStorage.setItem(`strand_setup_pending:${uid}`, "true");
        }
        toast.success("Welcome to Strand");
        // Send brand new users through the setup guide first; then onboarding.
        navigate("/setup", { replace: true });
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
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

        <form onSubmit={submit} className="space-y-4 selectable">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
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
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>

          <Button variant="gold" size="pill" type="submit" disabled={loading}>
            {loading ? "Please wait…" : mode === "signup" ? "Create Account →" : "Sign In →"}
          </Button>
        </form>

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
