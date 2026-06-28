import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import HairStrandIcon from "./HairStrandIcon";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

  useEffect(() => {
    try {
      const stored = localStorage.getItem("strand_last_display_name");
      if (stored) setFirstName(stored);
    } catch {}
  }, []);

  const nextParam = searchParams.get("next");
  const next = safeNext(nextParam, "/home");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || password.length < 6) {
      toast.error("Enter a valid email and a 6+ character password.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      toast.success("Signed in");
      navigate(next, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full px-7 pt-10 pb-8 bg-background">
      {/* Top: logo block */}
      <div className="flex flex-col items-center justify-start text-center">
        <HairStrandIcon className="w-16 h-16 text-primary mb-8" />

        <h1 className="font-display text-primary text-6xl font-semibold tracking-strand uppercase">
          Strand
        </h1>

        <div className="mt-8 max-w-[260px] text-foreground/75 text-sm leading-relaxed space-y-1">
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

      {/* Bottom: sign-in form */}
      <form onSubmit={submit} className="flex flex-col gap-3 selectable">
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
          <Input
            id="splash-password"
            type="password"
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
          onClick={() => {
            const qs = nextParam
              ? `?next=${encodeURIComponent(nextParam)}`
              : "";
            navigate(`/auth${qs}`);
          }}
          className="mt-1 text-center text-xs text-muted-foreground hover:text-foreground"
        >
          New to Strand? Create an account
        </button>
      </form>
    </div>
  );
};

export default SplashScreen;
