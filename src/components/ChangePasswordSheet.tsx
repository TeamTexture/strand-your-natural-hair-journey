import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";
import { toast } from "sonner";

/**
 * Shared change-password dialog used by members, professionals and brands.
 *
 * The current password is verified first with signInWithPassword against the
 * signed-in user's own email — that call refreshes the same session rather than
 * replacing it, so a wrong password never signs anyone out.
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
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = !busy && current.length > 0 && next.length >= 8 && next === confirm;

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  };

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const email = user?.email;
    if (!email) {
      setError("We couldn't read your account email. Please sign in again.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signInError) {
        setError("Current password is incorrect");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        const msg = updateError.message ?? "";
        if (/should be different/i.test(msg)) {
          setError("Your new password needs to be different from your current one.");
        } else if (/at least|too short|length/i.test(msg)) {
          setError("Use at least 8 characters.");
        } else {
          setError(msg || "Couldn't update your password. Please try again.");
        }
        return;
      }

      toast.success("Password updated");
      close(false);
    } catch {
      setError("No connection. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-[330px] rounded-[18px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[19px] font-semibold text-foreground">
            Change password
          </DialogTitle>
        </DialogHeader>

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

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              New password
            </Label>
            <PasswordInput
              value={next}
              autoComplete="new-password"
              minLength={8}
              onChange={(e) => setNext(e.target.value)}
              placeholder="At least 8 characters"
            />
            {tooShort && (
              <p className="text-[12px] font-body text-destructive">Use at least 8 characters.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Confirm new password
            </Label>
            <PasswordInput
              value={confirm}
              autoComplete="new-password"
              minLength={8}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter new password"
            />
            {mismatch && (
              <p className="text-[12px] font-body text-destructive">Passwords don't match.</p>
            )}
          </div>

          {error && (
            <p className="text-[12px] font-body text-destructive leading-snug">{error}</p>
          )}

          <Button variant="gold" size="pill" type="submit" disabled={!canSubmit}>
            {busy ? "Saving…" : "Update password →"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ChangePasswordSheet;
