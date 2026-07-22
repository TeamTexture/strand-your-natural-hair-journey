import { useEffect, useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
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
import type { Database } from "@/integrations/supabase/types";
import { normalizeInstagramHandle, instagramUrl, normalizeWebsiteUrl, externalLinkProps } from "@/lib/socialLinks";

type Discipline = Database["public"]["Enums"]["pro_discipline"];
const disciplines: Discipline[] = [
  "Trichologist",
  "Dermatologist",
  "Curl Specialist",
  "Colourist",
  "Stylist",
];

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;
type DayKey = typeof DAYS[number]["key"];

type DayHours = { closed: boolean; open: string; close: string };
type OpeningHours = Record<DayKey, DayHours>;

const defaultHours = (): OpeningHours =>
  DAYS.reduce((acc, d) => {
    acc[d.key] = {
      closed: d.key === "sun",
      open: "09:00",
      close: "17:00",
    };
    return acc;
  }, {} as OpeningHours);

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
  insurance_provider: z
    .string()
    .trim()
    .min(2, "Insurance provider is required")
    .max(160),
  insurance_policy_no: z
    .string()
    .trim()
    .min(2, "Insurance policy number is required")
    .max(80),
  insurance_expiry: z.string().optional().or(z.literal("")),
  business_phone: z.string().trim().max(40).optional().or(z.literal("")),
  business_email: z
    .string()
    .trim()
    .email("Enter a valid business email")
    .max(255)
    .optional()
    .or(z.literal("")),
  address_line1: z.string().trim().max(200).optional().or(z.literal("")),
  address_line2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  postcode: z.string().trim().max(16).optional().or(z.literal("")),
  website_url: z.string().trim().max(300).optional().or(z.literal("")),
  instagram_handle: z.string().trim().max(80).optional().or(z.literal("")),
  why_strand: z.string().trim().min(20, "Tell us a little more").max(1200),
});

type FormShape = z.infer<typeof schema>;

const initialForm: FormShape = {
  full_name: "",
  business_name: "",
  discipline: "Trichologist",
  qualifications: "",
  insurance_provider: "",
  insurance_policy_no: "",
  insurance_expiry: "",
  business_phone: "",
  business_email: "",
  address_line1: "",
  address_line2: "",
  city: "",
  location: "",
  postcode: "",
  website_url: "",
  instagram_handle: "",
  why_strand: "",
};

const ProApply = () => {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [initLoading, setInitLoading] = useState(true);
  const [appId, setAppId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormShape>(initialForm);
  const [hours, setHours] = useState<OpeningHours>(defaultHours());
  const [errors, setErrors] = useState<Partial<Record<keyof FormShape, string>>>({});

  useEffect(() => {
    if (!authLoading && !user) {
      nav("/pro/auth?mode=signup", { replace: true });
    }
  }, [authLoading, user, nav]);

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
          business_phone: (data as { business_phone?: string }).business_phone || "",
          business_email: (data as { business_email?: string }).business_email || "",
          address_line1: (data as { address_line1?: string }).address_line1 || "",
          address_line2: (data as { address_line2?: string }).address_line2 || "",
          city: (data as { city?: string }).city || "",
          location: data.location || "",
          postcode: data.postcode || "",
          website_url: data.website_url || "",
          instagram_handle: data.instagram_handle || "",
          why_strand: data.why_strand || "",
        });
        const savedHours = (data as unknown as { opening_hours?: OpeningHours | null }).opening_hours;
        if (savedHours && typeof savedHours === "object") {
          setHours({ ...defaultHours(), ...savedHours });
        }
      }
      setInitLoading(false);
    })();
  }, [user, nav]);

  const set = <K extends keyof FormShape>(k: K, v: FormShape[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const updateHours = (day: DayKey, patch: Partial<DayHours>) =>
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));

  const persist = async (opts: { submit: boolean }) => {
    if (!user) return;

    if (opts.submit) {
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        const nextErrors: Partial<Record<keyof FormShape, string>> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0] as keyof FormShape;
          if (!nextErrors[key]) nextErrors[key] = issue.message;
        }
        setErrors(nextErrors);
        toast.error(parsed.error.issues[0].message);
        return;
      }
      setErrors({});
    }

    setSaving(true);
    const payload: Record<string, unknown> = {
      user_id: user.id,
      email: user.email!,
      full_name: form.full_name || "",
      discipline: form.discipline,
      business_name: form.business_name || null,
      qualifications: form.qualifications || null,
      insurance_provider: form.insurance_provider || null,
      insurance_policy_no: form.insurance_policy_no || null,
      insurance_expiry: form.insurance_expiry || null,
      business_phone: form.business_phone || null,
      business_email: form.business_email || null,
      address_line1: form.address_line1 || null,
      address_line2: form.address_line2 || null,
      city: form.city || null,
      location: form.location || null,
      postcode: form.postcode || null,
      website_url: normalizeWebsiteUrl(form.website_url) || null,
      instagram_handle: normalizeInstagramHandle(form.instagram_handle) || null,
      why_strand: form.why_strand || "",
      opening_hours: hours,
      status: "pending" as const,
    };
    if (opts.submit) {
      payload.payment_confirmed_at = new Date().toISOString();
    }

    let error: unknown = null;
    let newId: string | null = appId;
    if (appId) {
      const res = await supabase
        .from("pro_applications")
        .update(payload as never)
        .eq("id", appId);
      error = res.error;
    } else {
      const res = await supabase
        .from("pro_applications")
        .insert(payload as never)
        .select("id")
        .maybeSingle();
      error = res.error;
      newId = (res.data as { id?: string } | null)?.id ?? null;
      if (newId) setAppId(newId);
    }
    setSaving(false);
    if (error) {
      console.error("[pro-apply] persist failed", error);
      toast.error(
        opts.submit
          ? "Couldn't submit — please try again."
          : "Couldn't save draft — please try again.",
      );
      return;
    }
    if (opts.submit) {
      toast.success("Application submitted.");
      nav("/pro/landing", { replace: true });
    } else {
      toast.success("Draft saved. You can come back any time.");
      nav("/pro/landing");
    }
  };

  const saveDraft = () => persist({ submit: false });
  const submit = () => persist({ submit: true });

  const sectionHeader = useMemo(
    () => "text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary",
    [],
  );

  if (authLoading || initLoading) return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar title="Apply to STRAND Pro" onBack={smartBack(nav, "/pro/landing")} />
      <div className="px-5 py-4 space-y-5">
        <SurfaceCard tone="gold">
          <p className="text-xs font-body leading-snug">
            <span className="font-semibold uppercase tracking-[0.15em] text-primary">
              Vetted directory —{" "}
            </span>
            Share your credentials and the Strand Council will be in touch. No payment
            is taken at application — you'll only subscribe once accepted. You can
            save your progress and come back to finish any time.
          </p>
        </SurfaceCard>

        {/* About you */}
        <section className="space-y-3">
          <p className={sectionHeader}>About you</p>
          <Field label="Full name *" error={errors.full_name}>
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
        </section>

        {/* Insurance */}
        <section className="space-y-3">
          <p className={sectionHeader}>Insurance</p>
          <Field label="Insurance provider *" error={errors.insurance_provider}>
            <Input
              value={form.insurance_provider}
              onChange={(e) => set("insurance_provider", e.target.value)}
              placeholder="e.g. Hiscox, Salon Gold"
            />
          </Field>
          <Field label="Policy number *" error={errors.insurance_policy_no}>
            <Input
              value={form.insurance_policy_no}
              onChange={(e) => set("insurance_policy_no", e.target.value)}
              placeholder="Policy reference"
            />
          </Field>
          <Field label="Insurance expiry">
            <Input
              type="date"
              value={form.insurance_expiry}
              onChange={(e) => set("insurance_expiry", e.target.value)}
            />
          </Field>
        </section>

        {/* Contact & address */}
        <section className="space-y-3">
          <p className={sectionHeader}>Contact & address</p>
          <Field label="Business phone">
            <Input
              type="tel"
              value={form.business_phone}
              onChange={(e) => set("business_phone", e.target.value)}
              placeholder="+44 20 7946 0000"
            />
          </Field>
          <Field label="Business email" error={errors.business_email}>
            <Input
              type="email"
              value={form.business_email}
              onChange={(e) => set("business_email", e.target.value)}
              placeholder="hello@yourclinic.co.uk"
            />
          </Field>
          <Field label="Address line 1">
            <Input
              value={form.address_line1}
              onChange={(e) => set("address_line1", e.target.value)}
              placeholder="12 Harley Street"
            />
          </Field>
          <Field label="Address line 2">
            <Input
              value={form.address_line2}
              onChange={(e) => set("address_line2", e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="City / town">
            <Input
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="London"
            />
          </Field>
          <Field label="Postcode">
            <Input
              value={form.postcode}
              onChange={(e) => set("postcode", e.target.value)}
              placeholder="W1G 9PG"
            />
          </Field>
          <Field label="Region / area served">
            <Input
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="London & remote"
            />
          </Field>
          <Field label="Website">
            <Input
              value={form.website_url}
              onChange={(e) => set("website_url", e.target.value)}
              placeholder="https://"
            />
            {form.website_url.trim() && (
              <a
                href={normalizeWebsiteUrl(form.website_url)}
                {...externalLinkProps}
                className="mt-1 block truncate text-[11px] text-primary underline underline-offset-2"
              >
                {normalizeWebsiteUrl(form.website_url)}
              </a>
            )}
          </Field>
          <Field label="Instagram handle">
            <Input
              value={form.instagram_handle}
              onChange={(e) => set("instagram_handle", e.target.value)}
              placeholder="@yourhandle"
            />
            <p className="mt-1 text-[11px] font-body text-muted-foreground">
              Paste your @handle or full URL — we'll clean it up.
            </p>
            {normalizeInstagramHandle(form.instagram_handle) && (
              <a
                href={instagramUrl(form.instagram_handle)}
                {...externalLinkProps}
                className="mt-1 block truncate text-[11px] text-primary underline underline-offset-2"
              >
                {instagramUrl(form.instagram_handle)}
              </a>
            )}
          </Field>
        </section>

        {/* Opening hours */}
        <section className="space-y-3">
          <p className={sectionHeader}>Opening hours</p>
          <p className="text-[11px] font-body text-muted-foreground leading-relaxed">
            Toggle off any day you're closed. Times use 24-hour format.
          </p>
          <div className="rounded-[14px] border border-border bg-card divide-y divide-border">
            {DAYS.map((d) => {
              const dh = hours[d.key];
              return (
                <div key={d.key} className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-body font-semibold text-foreground">
                      {d.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-body text-muted-foreground">
                        {dh.closed ? "Closed" : "Open"}
                      </span>
                      <Switch
                        checked={!dh.closed}
                        onCheckedChange={(v) => updateHours(d.key, { closed: !v })}
                        aria-label={`${d.label} open`}
                      />
                    </div>
                  </div>
                  {!dh.closed && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-body uppercase tracking-[0.12em] text-muted-foreground">
                          Opens
                        </Label>
                        <Input
                          type="time"
                          value={dh.open}
                          onChange={(e) => updateHours(d.key, { open: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-body uppercase tracking-[0.12em] text-muted-foreground">
                          Closes
                        </Label>
                        <Input
                          type="time"
                          value={dh.close}
                          onChange={(e) => updateHours(d.key, { close: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Motivation */}
        <section className="space-y-3">
          <p className={sectionHeader}>The Strand Council</p>
          <Field label="Why STRAND? *" error={errors.why_strand}>
            <Textarea
              rows={4}
              value={form.why_strand}
              onChange={(e) => set("why_strand", e.target.value)}
              placeholder="Tell us about your practice and why you want to join STRAND."
            />
          </Field>
        </section>

        <div className="space-y-2 pt-1">
          <Button
            variant="gold"
            size="pill"
            className="w-full"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Saving…" : "Submit application →"}
          </Button>
          <Button
            variant="outline"
            size="pill"
            className="w-full"
            onClick={saveDraft}
            disabled={saving}
          >
            Save & finish later
          </Button>
          <p className="text-[11px] text-muted-foreground font-body text-center leading-relaxed pt-1">
            Your draft is stored on your account — come back any time to pick up where
            you left off.
          </p>
        </div>
      </div>
    </ScreenLayout>
  );
};

const Field = ({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-body uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </Label>
    {children}
    {error && (
      <p className="text-[11px] font-body text-destructive leading-snug">{error}</p>
    )}
  </div>
);

export default ProApply;
