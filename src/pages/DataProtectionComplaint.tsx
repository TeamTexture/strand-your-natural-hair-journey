import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ShieldAlert, Send } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { smartBack } from "@/lib/smartBack";
import { useAuth } from "@/hooks/useAuth";
import {
  ACK_WINDOW_DAYS,
  COMPLAINT_STATUS_LABEL,
  useMyComplaints,
  useSubmitComplaint,
} from "@/hooks/useDataProtectionComplaints";

const DataProtectionComplaint = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const submit = useSubmitComplaint();
  const { data: mine = [] } = useMyComplaints();

  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submit.isPending) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return toast.error("Enter a valid email address.");
    if (subject.trim().length < 3) return toast.error("Add a short subject.");
    if (details.trim().length < 20)
      return toast.error("Please describe your complaint in a little more detail.");
    try {
      await submit.mutateAsync({
        contact_email: email.trim(),
        subject: subject.trim(),
        details: details.trim(),
      });
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your complaint.");
    }
  };

  if (sent) {
    return (
      <ScreenLayout>
        <TitleBar title="Data protection complaint" onBack={smartBack(nav, "/profile/data-access")} />
        <div className="px-5 pt-6 pb-8 flex flex-col items-center text-center">
          <div className="size-16 rounded-full bg-good/15 text-good flex items-center justify-center mb-4">
            <Check className="size-8" />
          </div>
          <h2 className="font-display text-xl font-semibold leading-tight">
            Complaint received
          </h2>
          <p className="text-sm font-body text-foreground/75 mt-2 max-w-[300px] leading-snug">
            We have your complaint and will acknowledge it within {ACK_WINDOW_DAYS} days,
            then respond without undue delay. Updates go to{" "}
            <span className="font-semibold text-foreground">{email.trim()}</span>.
          </p>
          <div className="mt-6 w-full max-w-[280px] space-y-2">
            <Button variant="gold" size="pill" onClick={() => nav("/profile/data-access")}>
              Back to data &amp; access
            </Button>
            <Button
              variant="goldGhost"
              size="pill"
              onClick={() => {
                setSent(false);
                setSubject("");
                setDetails("");
              }}
            >
              Raise another
            </Button>
          </div>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <TitleBar title="Data protection complaint" onBack={smartBack(nav, "/profile/data-access")} />

      <div className="px-5 pt-1 pb-3">
        <SurfaceCard className="flex items-start gap-3 py-3.5">
          <div className="size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <ShieldAlert className="size-4" />
          </div>
          <p className="text-[12px] font-body text-foreground/75 leading-snug">
            You have the right to complain to us directly about how your personal
            information is handled. We acknowledge every complaint within{" "}
            {ACK_WINDOW_DAYS} days and respond without undue delay. You can also
            complain to the Information Commissioner's Office at any time.
          </p>
        </SurfaceCard>
      </div>

      <SectionLabel>Tell us what happened</SectionLabel>
      <div className="px-5 pb-8">
        <SurfaceCard>
          <form onSubmit={handleSubmit} className="space-y-3.5 selectable">
            <div className="space-y-1.5">
              <Label
                htmlFor="dpc-email"
                className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                Email for our reply
              </Label>
              <Input
                id="dpc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                inputMode="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="dpc-subject"
                className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                Subject
              </Label>
              <Input
                id="dpc-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What is your complaint about?"
                maxLength={200}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="dpc-details"
                className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                Details
              </Label>
              <Textarea
                id="dpc-details"
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, 5000))}
                placeholder="Include dates and what you would like us to put right…"
                rows={6}
                required
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {details.length}/5000
              </p>
            </div>

            <Button variant="gold" size="pill" type="submit" disabled={submit.isPending}>
              {submit.isPending ? (
                "Sending…"
              ) : (
                <>
                  <Send className="size-4" /> Send complaint
                </>
              )}
            </Button>
          </form>
        </SurfaceCard>
      </div>

      {mine.length > 0 && (
        <>
          <SectionLabel>Your complaints</SectionLabel>
          <div className="px-5 pb-10 space-y-2">
            {mine.map((c) => (
              <SurfaceCard key={c.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-[14px] leading-tight flex-1">{c.subject}</p>
                  <span className="text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-body font-medium shrink-0">
                    {COMPLAINT_STATUS_LABEL[c.status]}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground font-body mt-1">
                  Sent {format(new Date(c.submitted_at), "d MMM yyyy")}
                  {c.acknowledged_at
                    ? ` · acknowledged ${format(new Date(c.acknowledged_at), "d MMM yyyy")}`
                    : ""}
                </p>
                {c.resolution_summary && (
                  <p className="text-[12px] font-body text-foreground/80 mt-1.5 leading-snug">
                    {c.resolution_summary}
                  </p>
                )}
              </SurfaceCard>
            ))}
          </div>
        </>
      )}
    </ScreenLayout>
  );
};

export default DataProtectionComplaint;
