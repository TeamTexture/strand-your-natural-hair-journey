import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/PasswordInput";
import PasswordField from "@/components/PasswordField";
import PasswordErrorNotice from "@/components/PasswordErrorNotice";
import {
  isPasswordAcceptable,
  mapPasswordError,
  passwordProblem,
  type MappedPasswordError,
} from "@/lib/passwordPolicy";
import { toast } from "sonner";

/**
 * Shared change-password dialog used by members, professionals and brands.
 *
 * One auth account per email — roles are resolved from the profiles table — so
 * this is the only change-password surface in the app.
 *
 * The current password is verified server-side by passing it to updateUser as
 * `current_password`; we never check it in the browser.
 */
const ChangePasswordSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MappedPasswordError | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");

  const mismatch = confirm.length > 0 && next !== confirm;

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    setNeedsCode(false);
    setCode("");
  };

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const runUpdate = async (nonce?: string) => {
    // `current_password` is verified by the auth server; the SDK typings don't
    // model it yet, so the payload is widened here only.
    const payload = {
      password: next,
      current_password: current,
      ...(nonce ? { nonce } : {}),
    } as Parameters<typeof supabase.auth.updateUser>[0];
    return supabase.auth.updateUser(payload);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    if (!user?.email) {
      setError({
        kind: "generic",
        message: "We couldn't read your account email. Please sign in again.",
      });
      return;
    }
    if (!current) {
      setError({ kind: "wrong_password", message: "Enter your current password." });
      return;
    }
    const problem = passwordProblem(next);
    if (problem) {
      setError({ kind: "weak_password", message: problem });
      return;
    }
    if (next !== confirm) {
      setError({ kind: "generic", message: "Passwords don't match." });
      return;
    }
    if (needsCode && code.trim().length !== 6) {
      setError({
        kind: "reauthentication_needed",
        message: "Enter the 6-digit code we emailed you.",
      });
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const { error: updateError } = await runUpdate(needsCode ? code.trim() : undefined);
      if (updateError) {
        const mapped = mapPasswordError(updateError, next);
        if (mapped.kind === "reauthentication_needed" && !needsCode) {
          await supabase.auth.reauthenticate();
          setNeedsCode(true);
        }
        setError(mapped);
        return;
      }

      toast.success("Password updated. We've emailed you a confirmation.");
      close(false);
    } catch {
      setError({
        kind: "generic",
        message: "No connection. Check your network and try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-[330px] rounded-[18px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-[19px] font-semibold text-foreground">
            Change password
          </DialogTitle>
        </DialogHeader>

        <p className="text-[12px] font-body text-foreground/70 leading-snug">
          This password is used for all your STRAND access.
        </p>

        <form onSubmit={submit} className="space-y-3.5 selectable">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Current password
            </Label>
            <PasswordInput
              value={current}
              autoComplete="current-password"
              onChange={(e) => {
                setCurrent(e.target.value);
                setError(null);
              }}
              placeholder="Your current password"
            />
          </div>

          <PasswordField
            label="New password"
            value={next}
            autoComplete="new-password"
            onChange={(e) => {
              setNext(e.target.value);
              setError(null);
            }}
            placeholder="Choose a new password"
          />

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Confirm new password
            </Label>
            <PasswordInput
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter new password"
            />
            {mismatch && (
              <p className="text-[12px] font-body text-destructive">Passwords don't match.</p>
            )}
          </div>

          {needsCode && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Email code
              </Label>
              <Input
                value={code}
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit code"
              />
              <p className="text-[11px] font-body text-muted-foreground leading-snug">
                We've emailed a 6-digit code to confirm it's you.
              </p>
            </div>
          )}

          <PasswordErrorNotice error={error} />

          <Button variant="gold" size="pill" type="submit">
            {busy ? "Saving…" : "Update password →"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ChangePasswordSheet;
