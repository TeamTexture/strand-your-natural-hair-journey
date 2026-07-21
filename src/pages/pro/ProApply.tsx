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
 * Professional application — details only. No payment at application time.
 * On submit we upsert into pro_applications and set `payment_confirmed_at`
 * to now() so the DB trigger + admin queue treat the row as "submitted"
 * (the column is retained for schema stability; semantically it's now
 * "submitted_at"). Payment is collected AFTER admin approval on
 * /pro/welcome.
 */
const ProApply = () => {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [initLoading, setInitLoading] = useState(true);
  const [appId, setAppId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
        // Already submitted — send them back to the landing (pending or approved).
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

  const persist = async (opts: { submit: boolean }) => {
    if (!user) return;

    if (opts.submit) {
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message);
        return;
      }
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
      location: form.location || null,
      postcode: form.postcode || null,
      website_url: form.website_url || null,
      instagram_handle: form.instagram_handle || null,
      why_strand: form.why_strand || "",
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


  if (authLoading || initLoading) return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar title="Apply to STRAND Pro" onBack={() => nav("/pro/landing")} />
      <div className="px-5 py-4 space-y-4">
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

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-body uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </Label>
    {children}
  </div>
);

export default ProApply;
