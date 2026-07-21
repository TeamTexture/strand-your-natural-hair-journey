import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle2, Circle, CreditCard } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Discipline = Database["public"]["Enums"]["pro_discipline"];
const disciplines: Discipline[] = [
  "Trichologist",
  "Dermatologist",
  "Curl Specialist",
  "Colourist",
  "Stylist",
];

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  business_name: z.string().trim().max(160).optional().or(z.literal("")),
  discipline: z.enum([
    "Trichologist",
    "Dermatologist",
    "Curl Specialist",
    "Colourist",
    "Stylist",
  ]),
  qualifications: z.string().trim().max(800).optional().or(z.literal("")),
  insurance_provider: z.string().trim().max(160).optional().or(z.literal("")),
  insurance_policy_no: z.string().trim().max(80).optional().or(z.literal("")),
  insurance_expiry: z.string().optional().or(z.literal("")),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  postcode: z.string().trim().max(16).optional().or(z.literal("")),
  website_url: z.string().trim().max(300).optional().or(z.literal("")),
  instagram_handle: z.string().trim().max(80).optional().or(z.literal("")),
  why_strand: z.string().trim().min(20, "Tell us a little more").max(1200),
});

type FormShape = z.infer<typeof schema>;

/**
 * Multi-step pro application flow.
 *
 *   Step 1 — practitioner details (upsert into pro_applications, still draft)
 *   Step 2 — payment (redirect to Stripe checkout via pro-application-checkout)
 *   Step 2 posts back to /pro/apply/confirmed which flips payment_confirmed_at.
 *
 * The application row is only visible to admins once payment_confirmed_at
 * is set (RLS + trigger). Users can resume the draft any time before pay.
 */
const ProApply = () => {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [initLoading, setInitLoading] = useState(true);
  const [appId, setAppId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [form, setForm] = useState<FormShape>({
    full_name: "",
    business_name: "",
    discipline: "Trichologist",
    qualifications: "",
    insurance_provider: "",
    insurance_policy_no: "",
    insurance_expiry: "",
    location: "",
    postcode: "",
    website_url: "",
    instagram_handle: "",
    why_strand: "",
  });

  useEffect(() => {
    if (!authLoading && !user) {
      nav("/pro/auth?mode=signup", { replace: true });
    }
  }, [authLoading, user, nav]);

  // Load latest draft/application, redirect if already submitted
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("pro_applications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        if (data.payment_confirmed_at) {
          // Already paid — user shouldn't be re-filling. Send to landing.
          nav("/pro/landing", { replace: true });
          return;
        }
        setAppId(data.id);
        setForm({
          full_name: data.full_name || "",
          business_name: data.business_name || "",
          discipline: (data.discipline as Discipline) || "Trichologist",
          qualifications: data.qualifications || "",
          insurance_provider: data.insurance_provider || "",
          insurance_policy_no: data.insurance_policy_no || "",
          insurance_expiry: data.insurance_expiry || "",
          location: data.location || "",
          postcode: data.postcode || "",
          website_url: data.website_url || "",
          instagram_handle: data.instagram_handle || "",
          why_strand: data.why_strand || "",
        });
      }
      setInitLoading(false);
    })();
  }, [user, nav]);

  const set = <K extends keyof FormShape>(k: K, v: FormShape[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const saveDraft = async (): Promise<string | null> => {
    if (!user) return null;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return null;
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
      email: user.email!,
      full_name: parsed.data.full_name,
      discipline: parsed.data.discipline,
      business_name: parsed.data.business_name || null,
      qualifications: parsed.data.qualifications || null,
      insurance_provider: parsed.data.insurance_provider || null,
      insurance_policy_no: parsed.data.insurance_policy_no || null,
      insurance_expiry: parsed.data.insurance_expiry || null,
      location: parsed.data.location || null,
      postcode: parsed.data.postcode || null,
      website_url: parsed.data.website_url || null,
      instagram_handle: parsed.data.instagram_handle || null,
      why_strand: parsed.data.why_strand,
    };
    let id = appId;
    if (id) {
      const { error } = await supabase
        .from("pro_applications")
        .update(payload as never)
        .eq("id", id);
      if (error) {
        setSaving(false);
        toast.error("Couldn't save — please try again.");
        return null;
      }
    } else {
      const { data, error } = await supabase
        .from("pro_applications")
        .insert(payload as never)
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        toast.error("Couldn't save — please try again.");
        return null;
      }
      id = data.id;
      setAppId(id);
    }
    setSaving(false);
    return id;
  };

  const continueToPayment = async () => {
    const id = await saveDraft();
    if (id) setStep(2);
  };

  const startPayment = async () => {
    if (!appId) return;
    setPayBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pro-application-checkout", {
        body: { application_id: appId },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Checkout URL missing");
      window.location.href = data.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
      setPayBusy(false);
    }
  };

  if (authLoading || initLoading) return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar
        title={step === 1 ? "Your practice" : "Membership payment"}
        onBack={() => (step === 2 ? setStep(1) : nav("/pro/landing"))}
      />

      <div className="px-5 py-4 space-y-4">
        <Stepper step={step} />

        {step === 1 && (
          <>
            <SurfaceCard tone="gold">
              <p className="text-xs font-body leading-snug">
                <span className="font-semibold uppercase tracking-[0.15em] text-primary">
                  Vetted directory —{" "}
                </span>
                Share your credentials so the Strand Council can review your practice.
              </p>
            </SurfaceCard>

            <Field label="Full name *">
              <Input
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="Dr Ada Lovelace"
              />
            </Field>
            <Field label="Business / clinic name">
              <Input
                value={form.business_name}
                onChange={(e) => set("business_name", e.target.value)}
              />
            </Field>
            <Field label="Discipline *">
              <Select
                value={form.discipline}
                onValueChange={(v) => set("discipline", v as Discipline)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {disciplines.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Qualifications">
              <Textarea
                rows={3}
                value={form.qualifications}
                onChange={(e) => set("qualifications", e.target.value)}
                placeholder="MBBS, IOT membership, City & Guilds, etc."
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Insurance provider">
                <Input
                  value={form.insurance_provider}
                  onChange={(e) => set("insurance_provider", e.target.value)}
                />
              </Field>
              <Field label="Policy number">
                <Input
                  value={form.insurance_policy_no}
                  onChange={(e) => set("insurance_policy_no", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Insurance expiry">
              <Input
                type="date"
                value={form.insurance_expiry}
                onChange={(e) => set("insurance_expiry", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Location">
                <Input
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="London"
                />
              </Field>
              <Field label="Postcode">
                <Input
                  value={form.postcode}
                  onChange={(e) => set("postcode", e.target.value)}
                  placeholder="SW3"
                />
              </Field>
            </div>
            <Field label="Website">
              <Input
                value={form.website_url}
                onChange={(e) => set("website_url", e.target.value)}
                placeholder="https://"
              />
            </Field>
            <Field label="Instagram handle">
              <Input
                value={form.instagram_handle}
                onChange={(e) => set("instagram_handle", e.target.value)}
                placeholder="@yourhandle"
              />
            </Field>
            <Field label="Why STRAND? *">
              <Textarea
                rows={4}
                value={form.why_strand}
                onChange={(e) => set("why_strand", e.target.value)}
                placeholder="Tell us about your practice and why you want to join STRAND."
              />
            </Field>

            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={continueToPayment}
              disabled={saving}
            >
              {saving ? "Saving…" : "Continue to payment →"}
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <SurfaceCard className="!p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <CreditCard className="size-5" />
                </div>
                <div>
                  <p className="font-display text-lg font-semibold leading-tight">
                    STRAND Pro Membership
                  </p>
                  <p className="text-[12px] font-body text-foreground/70 leading-snug">
                    Secure payment via Stripe. Your application is submitted for review
                    once payment succeeds.
                  </p>
                </div>
              </div>
              <ul className="text-[12.5px] font-body text-foreground/80 space-y-1 pt-1">
                <li>· Directory placement (upon approval)</li>
                <li>· Client enquiries with pre-populated context</li>
                <li>· Access to consented client passports</li>
                <li>· Cancel any time from the billing portal</li>
              </ul>
            </SurfaceCard>

            <SurfaceCard tone="gold" className="!p-4">
              <p className="text-[12px] font-body leading-snug text-foreground/85">
                If your application isn't accepted, your subscription is cancelled and
                you won't be charged again.
              </p>
            </SurfaceCard>

            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={startPayment}
              disabled={payBusy}
            >
              {payBusy ? "Redirecting to Stripe…" : "Pay & submit application →"}
            </Button>

            <button
              onClick={() => setStep(1)}
              className="mt-1 w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Review your details
            </button>
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

const Stepper = ({ step }: { step: 1 | 2 }) => (
  <div className="flex items-center gap-2 pb-1">
    <StepDot n={1} label="Details" active={step >= 1} done={step > 1} />
    <div className="h-px flex-1 bg-primary/20" />
    <StepDot n={2} label="Payment" active={step >= 2} done={false} />
  </div>
);

const StepDot = ({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) => (
  <div className="flex items-center gap-1.5">
    {done ? (
      <CheckCircle2 className="size-4 text-primary" />
    ) : active ? (
      <Circle className="size-4 text-primary fill-primary/20" />
    ) : (
      <Circle className="size-4 text-foreground/30" />
    )}
    <span
      className={
        "text-[10px] font-body uppercase tracking-[0.15em] " +
        (active ? "text-primary font-semibold" : "text-foreground/50")
      }
    >
      {label}
    </span>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-body uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </Label>
    {children}
  </div>
);

export default ProApply;
