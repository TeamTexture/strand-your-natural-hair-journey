import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import HairStrandIcon from "@/components/HairStrandIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FunctionsHttpError } from "@supabase/supabase-js";

/**
 * STRAND Pro forgot-password entry. Posts to the pro-password-reset edge
 * function, which mints a single-use native recovery link and delivers it via
 * Resend from noreply@mystrand.co.uk. The success state is identical whether or
 * not the email is registered.
 */
const ProForgotPassword = () => {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error: fnError } = await supabase.functions.invoke("pro-password-reset", {
        body: { email: value, redirectTo: `${window.location.origin}/pro/reset-password` },
      });
      if (fnError) {
        let message = "We couldn't send the email just now. Please try again.";
        if (fnError instanceof FunctionsHttpError) {
          try {
            const payload = await fnError.context.json();
            if (payload?.error) message = payload.error as string;
          } catch {
            /* keep fallback */
          }
        } else if (fnError.message?.toLowerCase().includes("failed to fetch")) {
          message = "No connection. Check your network and try again.";
        }
        setError(message);
        return;
      }
      setSent(true);
    } catch {
      setError("No connection. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="STRAND Pro" back />
      <div className="px-7 pt-2 pb-10">
        <div className="flex flex-col items-center text-center mb-6">
          <HairStrandIcon className="h-12 w-auto text-primary mb-3" />
          <p className="font-display italic text-[13px] text-foreground/70 uppercase tracking-[0.25em]">
            The Strand Council
          </p>
          <h2 className="font-display text-2xl font-semibold text-foreground mt-2">
            {sent ? "Check your inbox" : "Reset your password"}
          </h2>
          <p className="font-body text-[13px] text-foreground/70 max-w-[280px] mt-2 leading-snug">
            {sent
              ? "Your reset link is on its way. It can only be used once and expires in 1 hour."
              : "Enter the email on your practitioner account and we'll send you a secure link to set a new password."}

          </p>
        </div>

        {sent ? (
          <div className="space-y-3">
            <Button variant="gold" size="pill" onClick={() => nav("/pro/auth?mode=signin")}>
              Back to sign in →
            </Button>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 selectable">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Email
              </Label>
              <Input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="you@practice.com"
              />
            </div>

            {error && (
              <p className="text-[12px] font-body text-destructive leading-snug">{error}</p>
            )}

            <Button variant="gold" size="pill" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send reset link →"}
            </Button>

            <button
              type="button"
              onClick={() => nav("/pro/auth?mode=signin")}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </ScreenLayout>
  );
};

export default ProForgotPassword;
