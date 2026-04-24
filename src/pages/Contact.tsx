import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Send, Check } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const SUPPORT_EMAIL = "info@teamtexture.co.uk";

const Contact = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  // Pre-fill from auth + saved profile if available.
  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
    try {
      const raw = localStorage.getItem("strand_profile_basic");
      if (raw) {
        const p = JSON.parse(raw) as { name?: string };
        if (p.name && !name) setName(p.name);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();

    if (!cleanName) return toast.error("Add your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
      return toast.error("Enter a valid email address.");
    if (!cleanSubject) return toast.error("Add a subject.");
    if (cleanMessage.length < 5)
      return toast.error("Add a bit more detail in your message.");

    setSubmitting(true);
    try {
      const { error } = await supabase.from("contact_messages").insert({
        user_id: user?.id ?? null,
        name: cleanName,
        email: cleanEmail,
        phone: phone.trim() || null,
        subject: cleanSubject,
        message: cleanMessage,
        was_authenticated: !!user,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Message sent — we will reply within 1 working day.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not send message.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Contact Us" back />
        <div className="px-5 pt-6 pb-8 flex flex-col items-center text-center">
          <div className="size-16 rounded-full bg-good/15 text-good flex items-center justify-center mb-4">
            <Check className="size-8" />
          </div>
          <h2 className="font-display text-xl font-semibold leading-tight">
            Message sent
          </h2>
          <p className="text-sm font-body text-foreground/75 mt-2 max-w-[300px] leading-snug">
            Thanks {name.trim() || "for getting in touch"}. We will reply to{" "}
            <span className="font-semibold text-foreground">{email}</span> within
            1 working day.
          </p>
          <div className="mt-6 w-full max-w-[280px] space-y-2">
            <Button
              variant="gold"
              size="pill"
              onClick={() => {
                setSent(false);
                setSubject("");
                setMessage("");
              }}
            >
              Send another
            </Button>
            <Button variant="goldGhost" size="pill" onClick={() => navigate("/help")}>
              Back to Help
            </Button>
          </div>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Contact Us" back />

      <div className="px-5 pt-1 pb-3">
        <p className="font-body text-sm text-muted-foreground leading-snug">
          Send us a message and we will reply within 1 working day.
        </p>
      </div>

      {/* Direct email shortcut */}
      <div className="px-5 pb-4">
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=STRAND%20support`}
          className="w-full flex items-center gap-3 p-3.5 rounded-[12px] bg-card border border-border hover:border-primary/50 transition-colors min-h-[56px]"
        >
          <div className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Mail className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">Prefer email?</p>
            <p className="text-[11px] text-foreground/70 mt-0.5 break-all">
              {SUPPORT_EMAIL}
            </p>
          </div>
          <span className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium pr-1">
            Open ›
          </span>
        </a>
      </div>

      <SectionLabel>Send a message</SectionLabel>
      <div className="px-5 pb-8">
        <SurfaceCard>
          <form onSubmit={handleSubmit} className="space-y-3.5 selectable">
            <div className="space-y-1.5">
              <Label
                htmlFor="contact-name"
                className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                Your name
              </Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                autoComplete="name"
                maxLength={120}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="contact-email"
                className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                Email
              </Label>
              <Input
                id="contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="contact-phone"
                className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                Phone <span className="normal-case tracking-normal text-muted-foreground/70">(optional)</span>
              </Label>
              <Input
                id="contact-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44…"
                autoComplete="tel"
                inputMode="tel"
                maxLength={40}
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="contact-subject"
                className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                Subject
              </Label>
              <Input
                id="contact-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What is it about?"
                maxLength={200}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="contact-message"
                className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
              >
                Message
              </Label>
              <Textarea
                id="contact-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what is going on…"
                rows={5}
                maxLength={4000}
                required
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {message.length}/4000
              </p>
            </div>

            <Button variant="gold" size="pill" type="submit" disabled={submitting}>
              {submitting ? (
                "Sending…"
              ) : (
                <>
                  <Send className="size-4" /> Send message
                </>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center leading-snug">
              By sending, you agree to be contacted at the email above. We never
              sell your data.
            </p>
          </form>
        </SurfaceCard>
      </div>
    </ScreenLayout>
  );
};

export default Contact;
