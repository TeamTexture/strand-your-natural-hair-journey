import { useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proUserId: string;
  proName: string;
}

const SERVICES = [
  "Consultation",
  "Cut & shape",
  "Colour",
  "Treatment",
  "Braids / protective style",
  "Locs",
  "Silk press / blow-out",
  "Wedding / event",
  "Trichology / scalp",
  "Other",
];

const TIMEFRAMES = [
  "This week",
  "Next 2 weeks",
  "This month",
  "Within 3 months",
  "Flexible",
];

const CONTACT_METHODS = ["In-app", "Email", "Phone", "Text / WhatsApp"] as const;
type ContactMethod = (typeof CONTACT_METHODS)[number];

const LOCATIONS = ["In-salon", "Mobile (they come to me)", "Virtual", "No preference"];

const Chip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "px-3 py-1.5 rounded-full text-[11px] font-body border transition-colors",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card border-border text-foreground hover:border-primary/40",
    )}
  >
    {children}
  </button>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] uppercase tracking-[0.15em] text-primary font-medium mb-1.5">
    {children}
  </p>
);

const EnquiryDialog = ({ open, onOpenChange, proUserId, proName }: Props) => {
  const { user } = useAuth();
  const nav = useNavigate();
  const [service, setService] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<string | null>(null);
  const [contactMethod, setContactMethod] = useState<ContactMethod>("In-app");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState<string | null>(null);
  const [budget, setBudget] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const create = useCreateEnquiry();

  useEffect(() => {
    if (!open) {
      setService(null);
      setTimeframe(null);
      setContactMethod("In-app");
      setPhone("");
      setLocation(null);
      setBudget("");
      setNote("");
      setConsent(false);
    }
  }, [open]);

  const phoneNeeded = contactMethod === "Phone" || contactMethod === "Text / WhatsApp";
  const canSubmit =
    !!service &&
    !!timeframe &&
    consent &&
    (!phoneNeeded || phone.trim().length >= 6) &&
    note.trim().length > 0;

  const submit = async () => {
    if (!user) {
      toast("Sign in to send an enquiry");
      onOpenChange(false);
      nav("/auth?next=" + encodeURIComponent(location ? "" : window.location.pathname));
      return;
    }
    if (!canSubmit) {
      toast.error("Add a service, timing, and a short note so they can prepare.");
      return;
    }
    try {
      await create.mutateAsync({
        pro_user_id: proUserId,
        note: note.trim(),
        service_interest: service,
        preferred_timeframe: timeframe,
        contact_method: contactMethod,
        contact_phone: phoneNeeded ? phone.trim() : null,
        location_preference: location,
        budget_range: budget.trim() || null,
      });
      toast.success(`Enquiry sent to ${proName}`);
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not send enquiry";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[340px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Enquire with {proName}</DialogTitle>
          <DialogDescription className="text-xs">
            Give them what they need to prepare — the more you share, the better your first
            visit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>What are you looking for?</Label>
            <div className="flex flex-wrap gap-1.5">
              {SERVICES.map((s) => (
                <Chip key={s} active={service === s} onClick={() => setService(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <Label>How soon?</Label>
            <div className="flex flex-wrap gap-1.5">
              {TIMEFRAMES.map((t) => (
                <Chip key={t} active={timeframe === t} onClick={() => setTimeframe(t)}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <Label>Where would you like to be seen?</Label>
            <div className="flex flex-wrap gap-1.5">
              {LOCATIONS.map((l) => (
                <Chip key={l} active={location === l} onClick={() => setLocation(l)}>
                  {l}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <Label>Preferred contact</Label>
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_METHODS.map((m) => (
                <Chip
                  key={m}
                  active={contactMethod === m}
                  onClick={() => setContactMethod(m)}
                >
                  {m}
                </Chip>
              ))}
            </div>
            {phoneNeeded && (
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                className="mt-2 w-full text-sm p-2.5 rounded-[10px] border border-border bg-card focus:outline-none focus:border-primary/60"
              />
            )}
          </div>

          <div>
            <Label>Budget (optional)</Label>
            <input
              type="text"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="e.g. £80–£150"
              className="w-full text-sm p-2.5 rounded-[10px] border border-border bg-card focus:outline-none focus:border-primary/60"
            />
          </div>

          <div>
            <Label>Tell them a bit more</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Where's your hair right now, what result do you want, and anything they should know (recent colour, sensitivities, occasion)…"
              rows={4}
              maxLength={800}
              className="w-full text-sm p-3 rounded-[10px] border border-border bg-card resize-none focus:outline-none focus:border-primary/60"
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">
              {note.length}/800
            </p>
          </div>

          <label className="flex gap-2 items-start text-[12px] font-body leading-snug cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 accent-primary shrink-0"
            />
            <span>
              Share my Strand passport with {proName} so they can prepare (hair profile,
              goals, blood markers, products). You can revoke access at any time from
              Profile → Data access.
            </span>
          </label>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit || create.isPending}
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
