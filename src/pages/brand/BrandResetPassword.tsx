import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import HairStrandIcon from "@/components/HairStrandIcon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";
import { toast } from "sonner";
import { beginRecoveryLock, clearRecoveryLock } from "@/lib/recoveryLock";

/**
 * Brand reset landing. The recovery link (minted server-side and emailed via
 * Resend) drops the user here with a short-lived recovery session, so
 * updateUser({ password }) completes the reset and leaves them signed in.
 */
const BrandResetPassword = () => {
  const nav = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        done = true;
        beginRecoveryLock("brand");
        setStatus("ready");
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        done = true;
        beginRecoveryLock("brand");
        setStatus("ready");
      }
    });
    const timer = window.setTimeout(() => {
      if (!done) setStatus("invalid");
    }, 3500);
    return () => {
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = !busy && password.length >= 8 && password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      clearRecoveryLock();
      toast.success("Password updated. You're signed in.");
      nav("/brand", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't update your password.";
      if (/expired|invalid|session/i.test(msg)) {
        setStatus("invalid");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="Reset password" back />
      <div className="px-7 pt-2 pb-10">
        <div className="flex flex-col items-center text-center mb-6">
          <HairStrandIcon className="w-12 h-12 text-primary mb-3" />
          <p className="font-display italic text-[13px] text-foreground/70 uppercase tracking-[0.25em]">
            For Brands
          </p>
          <h2 className="font-display text-2xl font-semibold text-foreground mt-2">
            {status === "invalid" ? "Link no longer valid" : "Choose a new password"}
          </h2>
          <p className="font-body text-[13px] text-foreground/70 max-w-[280px] mt-2 leading-snug">
            {status === "invalid"
              ? "Reset links can only be used once and expire after 1 hour. Request a fresh link to continue."
              : "Set a password of at least 8 characters. You'll be signed straight into your brand dashboard."}
          </p>
        </div>

        {status === "checking" && (
          <p className="text-center text-xs text-muted-foreground font-body">Verifying your link…</p>
        )}

        {status === "invalid" && (
          <Button
            variant="gold"
            size="pill"
            onClick={() => nav("/brand/forgot-password", { replace: true })}
          >
            Request a new link →
          </Button>
        )}

        {status === "ready" && (
          <form onSubmit={submit} className="space-y-4 selectable">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                New password
              </Label>
              <PasswordInput
                value={password}
                autoComplete="new-password"
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
              {tooShort && (
                <p className="text-[12px] font-body text-destructive">Use at least 8 characters.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Confirm password
              </Label>
              <PasswordInput
                value={confirm}
                autoComplete="new-password"
                minLength={8}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
              />
              {mismatch && (
                <p className="text-[12px] font-body text-destructive">Passwords don't match.</p>
              )}
            </div>

            {error && (
              <p className="text-[12px] font-body text-destructive leading-snug">{error}</p>
            )}

            <Button variant="gold" size="pill" type="submit" disabled={!canSubmit}>
              {busy ? "Saving…" : "Save password →"}
            </Button>
          </form>
        )}
      </div>
    </ScreenLayout>
  );
};

export default BrandResetPassword;
