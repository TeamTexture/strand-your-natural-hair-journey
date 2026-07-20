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

/**
 * Password reset landing page. Supabase redirects users here from the
 * recovery email. When the URL hash contains `type=recovery`, Supabase's
 * client automatically exchanges the token for a short-lived session, so
 * calling `updateUser({ password })` is enough to complete the reset.
 */
const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Wait for Supabase to process the recovery hash before letting the
    // user submit — otherwise updateUser will fail with no active session.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    // If the page was opened without a recovery hash, still allow the form
    // (user might already be signed in from a previous session).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const passwordsMatch = password === confirmPassword;
  const canSubmit =
    !loading && password.length >= 6 && confirmPassword.length >= 6 && passwordsMatch;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordsMatch) {
      toast.error("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate("/home", { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't update password";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="Reset password" back />
      <div className="px-7 pt-2 pb-10 flex flex-col h-full">
        <div className="flex flex-col items-center text-center mb-8">
          <HairStrandIcon className="w-12 h-12 text-primary mb-4" />
          <p className="font-body text-base text-muted-foreground max-w-[260px] leading-snug">
            Choose a new password for your STRAND account.
          </p>
        </div>

        {!ready ? (
          <p className="text-center text-sm text-muted-foreground">
            Verifying your reset link…
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4 selectable">
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                New password
              </Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Confirm new password
              </Label>
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
            <Button variant="gold" size="pill" type="submit" disabled={!canSubmit}>
              {loading ? "Updating…" : "Update password →"}
            </Button>
          </form>
        )}
      </div>
    </ScreenLayout>
  );
};

export default ResetPassword;
