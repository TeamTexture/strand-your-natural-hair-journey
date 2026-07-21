import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useCreateEnquiry } from "@/hooks/useEnquiries";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proUserId: string;
  proName: string;
}

const EnquiryDialog = ({ open, onOpenChange, proUserId, proName }: Props) => {
  const { user } = useAuth();
  const nav = useNavigate();
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const create = useCreateEnquiry();

  const submit = async () => {
    if (!user) {
      toast("Sign in to send an enquiry");
      onOpenChange(false);
      nav("/auth?next=" + encodeURIComponent(location.pathname));
      return;
    }
    if (!consent) return;
    try {
      await create.mutateAsync({ pro_user_id: proUserId, note: note.trim() || null });
      toast.success(`Enquiry sent to ${proName}`);
      setNote("");
      setConsent(false);
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not send enquiry";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px]">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Enquire with {proName}</DialogTitle>
          <DialogDescription className="text-xs">
            Send a short note and share your Strand passport so they can prepare.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What would you like help with? (optional)"
            rows={4}
            className="w-full text-sm p-3 rounded-[10px] border border-border bg-card resize-none focus:outline-none focus:border-primary/60"
          />

          <label className="flex gap-2 items-start text-[12px] font-body leading-snug cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 accent-primary shrink-0"
            />
            <span>
              Share my Strand passport with {proName} so they can prepare for your consultation.
              You can revoke access at any time from Profile → Data access.
            </span>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!consent || create.isPending}
            className="min-w-[110px]"
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : "Send enquiry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EnquiryDialog;
