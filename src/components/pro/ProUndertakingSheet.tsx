import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Check, ExternalLink, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CONSENT_DOCUMENT_VERSION } from "@/lib/consent";
import { useProUndertaking } from "@/hooks/useProUndertaking";

/** Existing undertaking wording — unchanged. */
export const UNDERTAKING_TEXT =
  "I undertake to keep confidential any member health information I am granted access to through STRAND, to use it only to provide care to that member, and to handle it in line with the Professional Data Handling Undertaking.";

/** The consequence, stated plainly. */
export const UNDERTAKING_CONSEQUENCE =
  "Without accepting this, you will not be able to view client passports or any member health records. Everything else on the professional side stays available, and you can accept it later from Account.";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown when the sheet was opened by an attempt to open a passport. */
  context?: "entry" | "passport";
  onAccepted?: () => void;
}

const ProUndertakingSheet = ({ open, onOpenChange, context = "entry", onAccepted }: Props) => {
  const { accept, dismiss, inProView } = useProUndertaking();
  const [ticked, setTicked] = useState(false);
  const [saving, setSaving] = useState(false);

  const close = () => {
    dismiss();
    setTicked(false);
    onOpenChange(false);
  };

  const submit = async () => {
    if (!ticked) return;
    setSaving(true);
    try {
      await accept();
      toast.success("Thank you — that's recorded.");
      setTicked(false);
      onOpenChange(false);
      onAccepted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your undertaking.");
    } finally {
      setSaving(false);
    }
  };

  // HARD VIEW GUARD. This is a professional-view consent: it must never render
  // in My STRAND, the brand view or the admin view, whatever the account holds.
  if (!inProView) return null;

  return (

    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[19.5rem] rounded-[18px] p-5">
        <div className="flex items-center gap-2">
          <span className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          <DialogTitle className="font-display text-base leading-tight">
            Client data undertaking
          </DialogTitle>
        </div>

        <DialogDescription className="text-[12px] leading-relaxed text-muted-foreground">
          {context === "passport"
            ? "Client passports contain member health information. Please accept the undertaking to open them."
            : "One confidentiality undertaking covers every client whose records you are granted access to."}
        </DialogDescription>

        <button
          type="button"
          role="checkbox"
          id="pro-undertaking-tick"
          aria-checked={ticked}
          onClick={() => setTicked((v) => !v)}
          className="w-full flex gap-3 text-left"
        >
          <span
            className={`mt-0.5 size-5 shrink-0 rounded-[6px] border flex items-center justify-center transition-colors ${
              ticked ? "bg-primary border-primary text-primary-foreground" : "border-border bg-card"
            }`}
            aria-hidden="true"
          >
            {ticked && <Check className="size-3.5" strokeWidth={3} />}
          </span>
          <span className="text-[13px] leading-relaxed text-foreground">{UNDERTAKING_TEXT}</span>
        </button>

        <p className="text-[12px] leading-relaxed text-foreground/75 rounded-[12px] border border-border/70 bg-secondary/40 p-3">
          {UNDERTAKING_CONSEQUENCE}
        </p>

        <Link
          to="/legal/professional-undertaking"
          className="inline-flex items-center gap-1 text-[12px] text-primary underline underline-offset-4"
        >
          Read the Professional Data Handling Undertaking
          <ExternalLink className="size-3" aria-hidden="true" />
        </Link>

        <Button
          variant="gold"
          size="pill"
          className="w-full"
          disabled={!ticked || saving}
          onClick={submit}
        >
          {saving ? "Saving…" : "Accept undertaking"}
        </Button>

        <button
          type="button"
          onClick={close}
          className="w-full text-center text-[12px] text-muted-foreground underline underline-offset-4"
        >
          Not now
        </button>

        <p className="text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Document version {CONSENT_DOCUMENT_VERSION}
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default ProUndertakingSheet;
