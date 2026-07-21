import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
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
import LoadingDot from "@/components/LoadingDot";
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

const ProApply = () => {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [existingStatus, setExistingStatus] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    business_name: "",
    discipline: "Trichologist" as Discipline,
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

  // Redirect unauthenticated visitors to sign up first — applying requires
  // an account so admins can grant the professional role on approval.
  useEffect(() => {
    if (!authLoading && !user) {
      nav("/auth?next=%2Fpro%2Fapply&mode=signup", { replace: true });
    }
  }, [authLoading, user, nav]);

  // Preload email + surface any prior application so applicants don't submit
  // duplicates.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("pro_applications")
      .select("status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setExistingStatus(data.status);
      });
  }, [user]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!user) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const payload = {
      ...parsed.data,
      user_id: user.id,
      email: user.email!,
      // Normalise empty strings back to null so the DB stays clean.
      business_name: parsed.data.business_name || null,
      qualifications: parsed.data.qualifications || null,
      insurance_provider: parsed.data.insurance_provider || null,
      insurance_policy_no: parsed.data.insurance_policy_no || null,
      insurance_expiry: parsed.data.insurance_expiry || null,
      location: parsed.data.location || null,
      postcode: parsed.data.postcode || null,
      website_url: parsed.data.website_url || null,
      instagram_handle: parsed.data.instagram_handle || null,
    };
    const { error } = await supabase.from("pro_applications").insert(payload as never);
    setSubmitting(false);
    if (error) {
      console.error("[pro-apply] insert failed", error);
      toast.error("Couldn't submit — please try again.");
      return;
    }
    toast.success("Application submitted — we'll be in touch.");
    setExistingStatus("pending");
  };

  if (authLoading || !user) return <LoadingDot />;

  if (existingStatus) {
    return (
      <ScreenLayout>
        <TitleBar title="Apply as a Professional" backTo="/directory" />
        <div className="px-5 py-6 space-y-4">
          <SurfaceCard tone="gold">
            <p className="text-sm font-body leading-relaxed">
              <span className="font-semibold uppercase tracking-[0.15em] text-primary">
                Status —{" "}
              </span>
              {existingStatus === "pending" &&
                "Your application is with our team. We'll email you as soon as it's reviewed."}
              {existingStatus === "approved" &&
                "You're approved. Head to your professional dashboard."}
              {existingStatus === "rejected" &&
                "This application wasn't approved. Contact us if you'd like a review."}
              {existingStatus === "suspended" &&
                "Your account is currently suspended. Contact us for next steps."}
            </p>
          </SurfaceCard>
          {existingStatus === "approved" && (
            <Button className="w-full" onClick={() => nav("/pro")}>
              Open pro dashboard
            </Button>
          )}
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <TitleBar title="Apply as a Professional" backTo="/directory" />
      <div className="px-5 py-4 space-y-4">
        <SurfaceCard tone="gold">
          <p className="text-xs font-body leading-snug">
            <span className="font-semibold uppercase tracking-[0.15em] text-primary">
              Vetted directory —{" "}
            </span>
            STRAND professionals are hand-reviewed. Share your credentials below
            and our team will get back to you.
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
            placeholder="The Muse Salon"
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
            value={form.qualifications}
            onChange={(e) => set("qualifications", e.target.value)}
            placeholder="MBBS, MRCGP, IOT membership, etc."
            rows={3}
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
            value={form.why_strand}
            onChange={(e) => set("why_strand", e.target.value)}
            rows={4}
            placeholder="Tell us about your practice and why you want to join STRAND."
          />
        </Field>

        <Button className="w-full" onClick={submit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit application"}
        </Button>
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
