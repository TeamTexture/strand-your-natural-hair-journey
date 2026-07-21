import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import HairStrandIcon from "@/components/HairStrandIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Discipline = Database["public"]["Enums"]["pro_discipline"];
const disciplines: Discipline[] = [
  "Trichologist",
  "Stylist",
  "Curl Specialist",
  "Colourist",
  "Dermatologist",
];

/**
 * Dedicated professional auth surface. Visually distinct from consumer auth
 * (STRAND Pro framing, Council language) but shares design tokens. Signup
 * collects professional-relevant fields and stashes a starter draft on the
 * pro_applications table so the applicant lands in the pro flow, never
 * consumer onboarding.
 */
const ProAuth = () => {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialMode = params.get("mode") === "signin" ? "signin" : "signup";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const { user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [discipline, setDiscipline] = useState<Discipline>("Trichologist");
  const [busy, setBusy] = useState(false);

  // If already signed in, jump straight into the pro landing.
  useEffect(() => {
    if (!authLoading && user) nav("/pro/landing", { replace: true });
  }, [authLoading, user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || password.length < 6) {
      toast.error("Enter a valid email and a 6+ character password.");
      return;
    }
    if (mode === "signup") {
      if (password !== confirm) {
        toast.error("Passwords don't match.");
        return;
      }
      if (!fullName.trim()) {
        toast.error("Please enter your full name.");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/pro/landing`,
            data: {
              display_name: fullName,
              pro_intent: true,
            },
          },
        });
        if (error) {
          const msg = error.message?.toLowerCase() ?? "";
          if (msg.includes("already") || msg.includes("registered")) {
            toast.error("An account exists for this email. Please sign in.");
            setMode("signin");
            setBusy(false);
            return;
          }
          throw error;
        }
        const identities = data.user?.identities ?? [];
        if (data.user && identities.length === 0) {
          toast.error("An account exists for this email. Please sign in.");
          setMode("signin");
          setBusy(false);
          return;
        }
        const uid = data.user?.id;
        if (uid) {
          // Seed a draft application row so ProApply can pre-fill.
          await supabase.from("pro_applications").insert({
            user_id: uid,
            email,
            full_name: fullName,
            business_name: businessName || null,
            discipline,
          } as never);
        }
        toast.success("Welcome to STRAND Pro.");
        nav("/pro/landing", { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in.");
        nav("/pro/landing", { replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title={mode === "signup" ? "Join STRAND Pro" : "STRAND Pro"} back />
      <div className="px-7 pt-2 pb-10">
        <div className="flex flex-col items-center text-center mb-6">
          <HairStrandIcon className="w-12 h-12 text-primary mb-3" />
          <p className="font-display italic text-[13px] text-foreground/70 uppercase tracking-[0.25em]">
            The Strand Council
          </p>
          <h2 className="font-display text-2xl font-semibold text-foreground mt-2">
            {mode === "signup" ? "Apply to join" : "Practitioner sign-in"}
          </h2>
          <p className="font-body text-[13px] text-foreground/70 max-w-[280px] mt-2 leading-snug">
            {mode === "signup"
              ? "A vetted directory of trichologists, curl specialists, colourists and stylists championing textured hair."
              : "Access your dashboard, enquiries and client passports."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 selectable">
          {mode === "signup" && (
            <>
              <Field label="Full name">
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr Ada Lovelace"
                  autoComplete="name"
                />
              </Field>
              <Field label="Discipline">
                <Select value={discipline} onValueChange={(v) => setDiscipline(v as Discipline)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {disciplines.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Business / clinic (optional)">
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="The Muse Salon"
                />
              </Field>
            </>
          )}
          <Field label="Email">
            <Input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@practice.com"
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              value={password}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </Field>
          {mode === "signup" && (
            <Field label="Confirm password">
              <PasswordInput
                value={confirm}
                autoComplete="new-password"
                minLength={6}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
              />
            </Field>
          )}

          <Button variant="gold" size="pill" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signup" ? "Create pro account →" : "Sign In →"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode((m) => (m === "signup" ? "signin" : "signup"))}
          className="mt-5 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signup"
            ? "Already a STRAND professional? Sign in"
            : "New here? Apply to join"}
        </button>

        <div className="mt-6 pt-4 border-t border-border/60 text-center">
          <p className="text-[11px] text-muted-foreground font-body">
            Looking for the consumer app?{" "}
            <button
              type="button"
              onClick={() => nav("/auth")}
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Sign in here
            </button>
          </p>
        </div>
      </div>
    </ScreenLayout>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
      {label}
    </Label>
    {children}
  </div>
);

export default ProAuth;
