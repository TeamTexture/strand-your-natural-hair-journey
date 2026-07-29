import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proName: string;
  directoryId?: string | null;
  proUserId?: string | null;
}

/**
 * Enquiry form for Tier B (listed + in-app enquiry) professionals.
 * They have no dashboard or chat, so the enquiry is forwarded to their
 * registered email by the `directory-enquiry` edge function.
 */
const ExternalEnquiryDialog = ({ open, onOpenChange, proName, directoryId, proUserId }: Props) => {
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (message.trim().length < 5) {
      toast.error("Add a short message so they know what you need.");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("directory-enquiry", {
        body: {
          directory_id: directoryId ?? null,
          pro_user_id: proUserId ?? null,
          message: message.trim(),
          phone: phone.trim(),
        },
      });
      if (error) throw error;
      const delivered = (data as { delivered?: boolean } | null)?.delivered;
      toast.success(
        delivered
          ? `Sent to ${proName} — they'll reply to your email.`
          : `Enquiry logged. We'll pass it to ${proName}.`,
      );
      setMessage("");
      setPhone("");
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Could not send your enquiry. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Enquire with {proName}</DialogTitle>
          <DialogDescription className="text-[12px]">
            Your enquiry goes straight to their inbox — they'll reply to you by email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-primary font-medium mb-1.5">
              Your message
            </p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="What you're looking for, your hair type, and rough timing."
              className="text-sm"
            />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-primary font-medium mb-1.5">
              Phone (optional)
            </p>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="So they can call or text you back"
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="goldGhost" size="pill" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button size="pill" onClick={send} disabled={sending}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : "Send enquiry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExternalEnquiryDialog;
