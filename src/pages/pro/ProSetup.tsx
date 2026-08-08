import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import CapabilityClaimFields from "@/components/pro/CapabilityClaimFields";
import BioGuidance, { BIO_MAX_CHARS } from "@/components/pro/BioGuidance";
import {
  claimFromRow,
  claimPayload,
  emptyCapabilityClaim,
  validateCapabilityClaim,
  type CapabilityClaim,
} from "@/lib/proCapabilities";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyProProfile } from "@/hooks/useProProfileReview";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import {
  normalizeInstagramHandle,
  normalizeWebsiteUrl,
} from "@/lib/socialLinks";

type Discipline = Database["public"]["Enums"]["pro_discipline"];

interface Service {
  name: string;
  description?: string;
  price?: string;
}

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
type DayKey = (typeof DAYS)[number]["key"];
type DayHours = { closed: boolean; open: string; close: string };
type OpeningHours = Record<DayKey, DayHours>;

const defaultHours = (): OpeningHours =>
  DAYS.reduce((acc, d) => {
    acc[d.key] = { closed: d.key === "sun", open: "09:00", close: "17:00" };
    return acc;
  }, {} as OpeningHours);

const BUCKET = "pro-photos";

const useSignedUrl = (path: string | null | undefined) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
};

const Field = ({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-body uppercase tracking-[0.12em] text-muted-foreground">
      {label}
      {required && <span className="text-primary ml-1">*</span>}
    </Label>
    {children}
    {hint && (
      <p className="text-[11px] font-body text-muted-foreground leading-snug">
        {hint}
      </p>
    )}
  </div>
);

const StepHead = ({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string;
  title: string;
  blurb?: string;
}) => (
  <div className="pt-1">
    <p className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
      {eyebrow}
    </p>
    <h2 className="font-display text-xl font-semibold leading-tight mt-1">
      {title}
    </h2>
    {blurb && (
      <p className="text-[12px] font-body text-foreground/75 leading-snug mt-1.5">
        {blurb}
      </p>
    )}
  </div>
);

const PhotoTile = ({
  path,
  onRemove,
}: {
  path: string;
  onRemove: () => void;
}) => {
  const url = useSignedUrl(path);
  return (
    <div className="relative aspect-square rounded-[12px] overflow-hidden bg-secondary">
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 size-6 rounded-full bg-black/60 text-white flex items-center justify-center"
        aria-label="Remove photo"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
};

/** Total steps after the welcome screen. */
const STEP_TITLES = [
  "Identity",
  "Contact & booking",
  "Where you practise",
  "Services & specialisms",
  "Opening hours",
  "Photographs",
  "Review & save",
];

const ProSetup = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { profile, status, reviewNote, isLoading, refetch } = useMyProProfile();

  // -1 = welcome/intro screen.
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    display_name: "",
    discipline: "Trichologist" as Discipline,
    bio: "",
    location: "",
    postcode: "",
    contact_email: "",
    booking_url: "",
    website_url: "",
    instagram_handle: "",
    avatar_path: null as string | null,
    cover_path: null as string | null,
    photos: [] as string[],
    services: [] as Service[],
    specialisms: [] as string[],
    business_phone: "",
    business_email: "",
    address_line1: "",
    address_line2: "",
    city: "",
  });
  const [hours, setHours] = useState<OpeningHours>(defaultHours());
  const [specInput, setSpecInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  // Capability CLAIMS, submitted for admin review. Nothing is verified here.
  const [claims, setClaims] = useState<CapabilityClaim>(emptyCapabilityClaim());

  // Prefill from the existing skeleton row.
  useEffect(() => {
    if (!profile || hydrated) return;
    setForm({
      display_name: profile.display_name ?? "",
      discipline: profile.discipline,
      bio: profile.bio ?? "",
      location: profile.location ?? "",
      postcode: profile.postcode ?? "",
      contact_email: profile.contact_email ?? "",
      booking_url: profile.booking_url ?? "",
      website_url: profile.website_url ?? "",
      instagram_handle: profile.instagram_handle ?? "",
      avatar_path: profile.avatar_path,
      cover_path: profile.cover_path,
      photos: profile.photos ?? [],
      services: Array.isArray(profile.services)
        ? (profile.services as unknown as Service[])
        : [],
      specialisms: (profile.specialisms as string[] | null) ?? [],
      business_phone: profile.business_phone ?? "",
      business_email: profile.business_email ?? "",
      address_line1: profile.address_line1 ?? "",
      address_line2: profile.address_line2 ?? "",
      city: profile.city ?? "",
    });
    const saved = profile.opening_hours as OpeningHours | null;
    if (saved && typeof saved === "object") {
      setHours({ ...defaultHours(), ...saved });
    }
    setClaims(claimFromRow(profile as unknown as Record<string, unknown>));
    setHydrated(true);
  }, [profile, hydrated]);

  const avatarUrl = useSignedUrl(form.avatar_path);
  const coverUrl = useSignedUrl(form.cover_path);

  const payload = useMemo(
    () => ({
      display_name: form.display_name.trim(),
      discipline: form.discipline,
      bio: form.bio.trim() || null,
      location: form.location.trim() || null,
      postcode: form.postcode.trim() || null,
      contact_email: form.contact_email.trim() || null,
      booking_url: form.booking_url.trim() || null,
      website_url: normalizeWebsiteUrl(form.website_url) || null,
      instagram_handle:
        normalizeInstagramHandle(form.instagram_handle) || null,
      avatar_path: form.avatar_path,
      cover_path: form.cover_path,
      photos: form.photos,
      services: form.services.filter((s) => s.name.trim()) as never,
      specialisms: form.specialisms,
      business_phone: form.business_phone.trim() || null,
      business_email: form.business_email.trim() || null,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      opening_hours: hours as never,
      // Claims go in as claims. Verification is an admin action, elsewhere.
      ...(claimPayload(claims) as Record<string, unknown>),
    }),
    [form, hours, claims],
  );

  const saveDraft = async () => {
    if (!user) return;
    const { error: e } = await supabase
      .from("pro_profiles")
      .update(payload)
      .eq("user_id", user.id);
    if (e) throw e;
  };

  /**
   * POLICY (Paige): approval is a ONE-TIME gate at application stage only.
   * Once an application is approved, every subsequent profile save goes live
   * on the directory immediately — there is no re-approval flow for edits.
   * Admin suspension still removes a listing, so a suspended profile is never
   * silently re-published here.
   */
  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const suspended = !!profile?.suspended_at;
      const { error: e } = await supabase
        .from("pro_profiles")
        .update({
          ...payload,
          profile_review_status: "approved",
          review_note: null,
          submitted_at: new Date().toISOString(),
          reviewed_at: new Date().toISOString(),
          ...(suspended ? {} : { is_published: true }),
        })
        .eq("user_id", user.id);
      if (e) throw e;
      return { suspended };
    },
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["pro_profile_review"] });
      qc.invalidateQueries({ queryKey: ["pro_profile", user?.id] });
      qc.invalidateQueries({ queryKey: ["pro_directory"] });
      qc.invalidateQueries({ queryKey: ["directory"] });
      await refetch();
      toast.success(
        res?.suspended
          ? "Saved. Your listing stays hidden while your account is suspended."
          : "Saved — your listing is live in the directory.",
      );
      nav("/pro/profile", { replace: true });
    },
    onError: (e: Error) => toast.error(e.message ?? "Could not save"),
  });


  const uploadFile = async (
    file: File,
    kind: "avatar" | "cover" | "gallery",
  ) => {
    if (!user) return;
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
    const { error: e } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (e) {
      toast.error(e.message);
      return;
    }
    setForm((f) =>
      kind === "avatar"
        ? { ...f, avatar_path: path }
        : kind === "cover"
          ? { ...f, cover_path: path }
          : { ...f, photos: [...f.photos, path] },
    );
  };

  const addSpecialism = () => {
    const v = specInput.trim();
    if (!v) return;
    if (form.specialisms.includes(v) || form.specialisms.length >= 12) {
      setSpecInput("");
      return;
    }
    setForm((f) => ({ ...f, specialisms: [...f.specialisms, v] }));
    setSpecInput("");
  };

  const updateHours = (day: DayKey, patch: Partial<DayHours>) =>
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));

  /** Validation per step (index matches STEP_TITLES). */
  const validate = (i: number): string | null => {
    if (i === 0) {
      if (form.display_name.trim().length < 2)
        return "Please add the name members will see.";
      if (form.bio.trim().length < 40)
        return "Please write at least a couple of sentences about your practice.";
      if (form.bio.trim().length > BIO_MAX_CHARS)
        return `Please keep your bio under ${BIO_MAX_CHARS} characters — you can add more detail to your listing once accepted.`;

      if (!form.avatar_path) return "Please upload a headshot.";
    }
    if (i === 1) {
      const email = form.contact_email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return "Please add a valid contact email.";
      if (form.business_phone.trim().length < 7)
        return "Please add a business phone number.";
    }
    if (i === 2) {
      if (!form.address_line1.trim()) return "Please add your address.";
      if (!form.city.trim()) return "Please add your city or town.";
      if (!form.postcode.trim()) return "Please add your postcode.";
      if (!form.location.trim())
        return "Please say which area you serve (e.g. London & remote).";
    }
    if (i === 3) {
      if (!form.services.some((s) => s.name.trim()))
        return "Please add at least one service.";
      if (form.specialisms.length === 0)
        return "Please add at least one specialism.";
      // A ticked capability box must carry its supporting detail.
      const claimError = validateCapabilityClaim(claims);
      if (claimError) return claimError;
    }
    if (i === 5) {
      if (!form.cover_path && form.photos.length === 0)
        return "Please add a cover photo or at least one portfolio image.";
    }
    return null;
  };

  const firstIncompleteStep = () => {
    for (let i = 0; i < STEP_TITLES.length - 1; i += 1) {
      if (validate(i)) return i;
    }
    return null;
  };

  const [advancing, setAdvancing] = useState(false);
  const next = async () => {
    const msg = validate(step);
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    try {
      setAdvancing(true);
      await saveDraft();
      setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1));
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error((e as Error).message ?? "Could not save");
    } finally {
      setAdvancing(false);
    }
  };

  const back = () => {
    setError(null);
    setStep((s) => s - 1);
    window.scrollTo({ top: 0 });
  };

  if (isLoading) return <LoadingDot />;

  if (!profile) {
    return (
      <ScreenLayout>
        <TitleBar title="Set up your profile" back={false} />
        <div className="px-5 py-8">
          <SurfaceCard>
            <p className="text-sm font-body">
              We can't find your professional profile yet. Please contact the
              Strand team and we'll get it opened for you.
            </p>
            <Button
              variant="goldOutline"
              className="w-full mt-3"
              onClick={() => nav("/contact")}
            >
              Contact the Strand team
            </Button>
          </SurfaceCard>
        </div>
      </ScreenLayout>
    );
  }

  // ---------------------------------------------------------------- welcome
  if (step === -1) {
    return (
      <ScreenLayout>
        <TitleBar title="Professional setup" back={false} />
        <div className="px-5 pb-10 space-y-4">
          {status === "changes_requested" && (
            <SurfaceCard tone="gold">
              <div className="flex items-start gap-2">
                <AlertCircle className="size-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
                    Changes requested
                  </p>
                  <p className="text-[12px] font-body text-foreground/85 leading-snug mt-1">
                    {reviewNote?.trim() ||
                      "Please finish the sections below — your listing updates as soon as you save."}
                  </p>
                </div>
              </div>
            </SurfaceCard>
          )}

          <div className="pt-3 text-center">
            <div className="mx-auto size-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles className="size-6" />
            </div>
            <h1 className="font-display text-2xl font-semibold leading-tight mt-3">
              Set up your professional profile
            </h1>
            <p className="text-[13px] font-body text-foreground/75 leading-relaxed mt-2">
              You're already approved, so everything you save here goes live in
              the directory straight away. It takes about ten minutes, and it's
              the first thing a member reads about you.
            </p>
          </div>

          <SurfaceCard>
            <p className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
              What we'll ask for
            </p>
            <ul className="mt-2 space-y-1.5 text-[12px] font-body text-foreground/80 leading-snug">
              {STEP_TITLES.slice(0, -1).map((t, i) => (
                <li key={t}>
                  · {t}
                  {i === 0 && " — your name, discipline, bio and headshot"}
                </li>
              ))}
              <li>· A final read-through, then save — it publishes instantly.</li>
            </ul>
          </SurfaceCard>

          <SurfaceCard>
            <p className="text-[12px] font-body text-foreground/80 leading-snug">
              Your work saves as you go, so you can stop and come back. When you
              save, your directory listing updates immediately — no second
              approval needed.
            </p>
          </SurfaceCard>

          <Button
            variant="gold"
            className="w-full"
            onClick={() => {
              setStep(0);
              window.scrollTo({ top: 0 });
            }}
          >
            Begin setup <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      </ScreenLayout>
    );
  }

  const isReview = step === STEP_TITLES.length - 1;
  const progress = ((step + 1) / STEP_TITLES.length) * 100;

  return (
    <ScreenLayout>
      <TitleBar title="Professional setup" back={false} />
      <div className="px-5 pb-10 space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body font-medium">
              Step {step + 1} of {STEP_TITLES.length}
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-primary font-body font-semibold">
              {STEP_TITLES[step]}
            </span>
          </div>
          <div className="h-1.5 bg-primary/10 rounded-full overflow-hidden mt-1.5">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-[12px] border border-warn/40 bg-warn/10 p-3 flex items-start gap-2">
            <AlertCircle className="size-4 text-warn mt-0.5 shrink-0" />
            <p className="text-[12px] font-body text-foreground/85 leading-snug">
              {error}
            </p>
          </div>
        )}

        {/* ------------------------------------------------ 0. Identity */}
        {step === 0 && (
          <>
            <StepHead
              eyebrow="Identity"
              title="Who members will meet"
              blurb="Your name, your discipline and a bio in your own voice."
            />
            <div className="flex items-center gap-4">
              <div className="size-20 rounded-full overflow-hidden bg-primary/10 border border-border shrink-0 flex items-center justify-center">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No photo
                  </span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <label className="inline-flex items-center gap-2 text-xs font-body px-3 py-2 rounded-full border border-border cursor-pointer hover:border-primary/50">
                  <Upload className="size-3.5" /> Upload headshot
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadFile(f, "avatar");
                    }}
                  />
                </label>
                <p className="text-[11px] font-body text-muted-foreground leading-snug">
                  Shown as the round headshot on your directory card.
                </p>
              </div>
            </div>

            <Field label="Display name" required>
              <Input
                value={form.display_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, display_name: e.target.value }))
                }
                
              />
            </Field>

            <Field label="Discipline" required>
              <Select
                value={form.discipline}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, discipline: v as Discipline }))
                }
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

            <Field
              label="Bio"
              required
              hint="Three or four short sentences on your focus, your approach and who you love working with."
            >
              <Textarea
                rows={6}
                maxLength={BIO_MAX_CHARS}
                value={form.bio}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bio: e.target.value.slice(0, BIO_MAX_CHARS) }))
                }
                placeholder="Tell members about your practice."
              />
              <div className="mt-2">
                <BioGuidance value={form.bio} applicationStage />
              </div>
            </Field>

          </>
        )}

        {/* ------------------------------------------ 1. Contact & booking */}
        {step === 1 && (
          <>
            <StepHead
              eyebrow="Contact & booking"
              title="How members reach you"
              blurb="Enquiries come through STRAND first — these details are for confirmed clients and your listing."
            />
            <Field label="Contact email" required>
              <Input
                type="email"
                value={form.contact_email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contact_email: e.target.value }))
                }
                placeholder="hello@yourclinic.co.uk"
              />
            </Field>
            <Field label="Business phone" required>
              <Input
                type="tel"
                value={form.business_phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, business_phone: e.target.value }))
                }
                placeholder="+44 20 7946 0000"
              />
            </Field>
            <Field label="Business email">
              <Input
                type="email"
                value={form.business_email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, business_email: e.target.value }))
                }
                placeholder="admin@yourclinic.co.uk"
              />
            </Field>
            <Field label="Booking URL">
              <Input
                value={form.booking_url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, booking_url: e.target.value }))
                }
                placeholder="https://"
              />
            </Field>
            <Field label="Website">
              <Input
                value={form.website_url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, website_url: e.target.value }))
                }
                placeholder="https://"
              />
            </Field>
            <Field
              label="Instagram"
              hint="Paste your @handle or full URL — we'll clean it up."
            >
              <Input
                value={form.instagram_handle}
                onChange={(e) =>
                  setForm((f) => ({ ...f, instagram_handle: e.target.value }))
                }
                placeholder="@yourhandle"
              />
            </Field>
          </>
        )}

        {/* ------------------------------------------- 2. Where you practise */}
        {step === 2 && (
          <>
            <StepHead
              eyebrow="Where you practise"
              title="Your address and area"
              blurb="Members use this to find someone near them."
            />
            <Field label="Address line 1" required>
              <Input
                value={form.address_line1}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address_line1: e.target.value }))
                }
                
              />
            </Field>
            <Field label="Address line 2">
              <Input
                value={form.address_line2}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address_line2: e.target.value }))
                }
                placeholder="Optional"
              />
            </Field>
            <Field label="City / town" required>
              <Input
                value={form.city}
                onChange={(e) =>
                  setForm((f) => ({ ...f, city: e.target.value }))
                }
                
              />
            </Field>
            <Field label="Postcode" required>
              <Input
                value={form.postcode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, postcode: e.target.value }))
                }
                
              />
            </Field>
            <Field label="Region / area served" required>
              <Input
                value={form.location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location: e.target.value }))
                }
                
              />
            </Field>
          </>
        )}

        {/* -------------------------------------- 3. Services & specialisms */}
        {step === 3 && (
          <>
            <StepHead
              eyebrow="Services & specialisms"
              title="What you offer"
              blurb="At least one service and one specialism. Specialisms show as chips on your card."
            />

            <div className="space-y-2.5">
              {form.services.map((s, i) => (
                <SurfaceCard key={i}>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Input
                        className="flex-1"
                        placeholder="Service name"
                        value={s.name}
                        onChange={(e) =>
                          setForm((f) => {
                            const list = [...f.services];
                            list[i] = { ...list[i], name: e.target.value };
                            return { ...f, services: list };
                          })
                        }
                      />
                      <button
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            services: f.services.filter((_, x) => x !== i),
                          }))
                        }
                        className="p-2 text-muted-foreground hover:text-alert-dark"
                        aria-label="Remove service"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="Description"
                      value={s.description ?? ""}
                      onChange={(e) =>
                        setForm((f) => {
                          const list = [...f.services];
                          list[i] = {
                            ...list[i],
                            description: e.target.value,
                          };
                          return { ...f, services: list };
                        })
                      }
                    />
                    <Input
                      placeholder="Price (e.g. £120)"
                      value={s.price ?? ""}
                      onChange={(e) =>
                        setForm((f) => {
                          const list = [...f.services];
                          list[i] = { ...list[i], price: e.target.value };
                          return { ...f, services: list };
                        })
                      }
                    />
                  </div>
                </SurfaceCard>
              ))}
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    services: [...f.services, { name: "" }],
                  }))
                }
              >
                <Plus className="size-4 mr-1" /> Add service
              </Button>
            </div>

            <div className="pt-2 space-y-2">
              <Label className="text-xs font-body uppercase tracking-[0.12em] text-muted-foreground">
                Specialisms <span className="text-primary">*</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {form.specialisms.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 bg-primary/10 text-foreground text-[11px] px-2 py-1 rounded-full"
                  >
                    {s}
                    <button
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          specialisms: f.specialisms.filter((x) => x !== s),
                        }))
                      }
                      className="text-muted-foreground hover:text-alert-dark"
                      aria-label={`Remove ${s}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                {form.specialisms.length === 0 && (
                  <span className="text-[11px] text-muted-foreground font-body">
                    None yet.
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={specInput}
                  onChange={(e) => setSpecInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSpecialism();
                    }
                  }}
                  placeholder='e.g. "Traction alopecia"'
                />
                <Button type="button" variant="outline" onClick={addSpecialism}>
                  <Plus className="size-4" />
                </Button>
              </div>
              <p className="text-[11px] font-body text-muted-foreground leading-snug">
                Max 12.
              </p>
            </div>

            <div className="pt-4 space-y-2">
              <Label className="text-xs font-body uppercase tracking-[0.12em] text-muted-foreground">
                Clinical capabilities
              </Label>
              <CapabilityClaimFields value={claims} onChange={setClaims} />
            </div>
          </>
        )}

        {/* ------------------------------------------------ 4. Opening hours */}
        {step === 4 && (
          <>
            <StepHead
              eyebrow="Opening hours"
              title="When you're open"
              blurb="Toggle off any day you're closed. 24-hour format."
            />
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
                          onCheckedChange={(v) =>
                            updateHours(d.key, { closed: !v })
                          }
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
                            onChange={(e) =>
                              updateHours(d.key, { open: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-body uppercase tracking-[0.12em] text-muted-foreground">
                            Closes
                          </Label>
                          <Input
                            type="time"
                            value={dh.close}
                            onChange={(e) =>
                              updateHours(d.key, { close: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* -------------------------------------------------- 5. Photographs */}
        {step === 5 && (
          <>
            <StepHead
              eyebrow="Photographs"
              title="Show your work"
              blurb="A cover image for your listing, plus portfolio photographs."
            />
            <div className="space-y-2">
              <Label className="text-xs font-body uppercase tracking-[0.12em] text-muted-foreground">
                Cover photo
              </Label>
              <div className="rounded-[14px] overflow-hidden border border-border bg-secondary aspect-[16/9] flex items-center justify-center">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No cover photo
                  </span>
                )}
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-body px-3 py-2 rounded-full border border-border cursor-pointer hover:border-primary/50">
                <Upload className="size-3.5" /> Upload cover
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile(f, "cover");
                  }}
                />
              </label>
            </div>

            <div className="space-y-2 pt-2">
              <Label className="text-xs font-body uppercase tracking-[0.12em] text-muted-foreground">
                Portfolio
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {form.photos.map((p) => (
                  <PhotoTile
                    key={p}
                    path={p}
                    onRemove={() =>
                      setForm((f) => ({
                        ...f,
                        photos: f.photos.filter((x) => x !== p),
                      }))
                    }
                  />
                ))}
                <label className="aspect-square rounded-[12px] border border-dashed border-border flex flex-col items-center justify-center text-xs text-muted-foreground cursor-pointer hover:border-primary/50">
                  <Upload className="size-4 mb-1" /> Add
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadFile(f, "gallery");
                    }}
                  />
                </label>
              </div>
            </div>
          </>
        )}

        {/* ----------------------------------------------- 6. Review & save */}
        {isReview && (
          <>
            <StepHead
              eyebrow="Review & save"
              title="One last read-through"
              blurb="Check everything reads the way you'd want a member to read it."
            />

            {(() => {
              const incomplete = firstIncompleteStep();
              if (incomplete === null) {
                return (
                  <SurfaceCard tone="gold">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
                      <p className="text-[12px] font-body text-foreground/85 leading-snug">
                        Everything required is complete. Submit when you're
                        ready and the Strand Council will review it by hand.
                      </p>
                    </div>
                  </SurfaceCard>
                );
              }
              return (
                <div className="rounded-[12px] border border-warn/40 bg-warn/10 p-3">
                  <p className="text-[12px] font-body text-foreground/85 leading-snug">
                    {validate(incomplete)}
                  </p>
                  <Button
                    variant="goldOutline"
                    size="pill"
                    className="mt-2 !min-h-[34px] !text-[11px]"
                    onClick={() => setStep(incomplete)}
                  >
                    Go to {STEP_TITLES[incomplete]}
                  </Button>
                </div>
              );
            })()}

            <ReviewBlock
              title="Identity"
              onEdit={() => setStep(0)}
              rows={[
                ["Display name", form.display_name],
                ["Discipline", form.discipline],
                ["Bio", form.bio],
                ["Headshot", form.avatar_path ? "Uploaded" : "Not set"],
              ]}
            />
            <ReviewBlock
              title="Contact & booking"
              onEdit={() => setStep(1)}
              rows={[
                ["Contact email", form.contact_email],
                ["Business phone", form.business_phone],
                ["Business email", form.business_email],
                ["Booking URL", form.booking_url],
                ["Website", form.website_url],
                ["Instagram", form.instagram_handle],
              ]}
            />
            <ReviewBlock
              title="Where you practise"
              onEdit={() => setStep(2)}
              rows={[
                ["Address", [form.address_line1, form.address_line2].filter(Boolean).join(", ")],
                ["City / town", form.city],
                ["Postcode", form.postcode],
                ["Area served", form.location],
              ]}
            />
            <ReviewBlock
              title="Services & specialisms"
              onEdit={() => setStep(3)}
              rows={[
                [
                  "Services",
                  form.services
                    .filter((s) => s.name.trim())
                    .map((s) => s.name + (s.price ? ` · ${s.price}` : ""))
                    .join("\n"),
                ],
                ["Specialisms", form.specialisms.join(", ")],
              ]}
            />
            <ReviewBlock
              title="Opening hours"
              onEdit={() => setStep(4)}
              rows={DAYS.map((d) => [
                d.label,
                hours[d.key].closed
                  ? "Closed"
                  : `${hours[d.key].open} – ${hours[d.key].close}`,
              ])}
            />
            <ReviewBlock
              title="Photographs"
              onEdit={() => setStep(5)}
              rows={[
                ["Cover photo", form.cover_path ? "Uploaded" : "Not set"],
                ["Portfolio", `${form.photos.length} image(s)`],
              ]}
            />

            <SurfaceCard>
              <p className="text-[12px] font-body text-foreground/80 leading-snug">
                Saving publishes these details to your directory listing right
                away, so members see them immediately.
              </p>
            </SurfaceCard>
          </>
        )}

        {/* --------------------------------------------------- Step footer */}
        <div className="flex gap-2 pt-3">
          <Button
            variant="goldOutline"
            className="flex-1"
            onClick={() => (step === 0 ? setStep(-1) : back())}
            disabled={advancing || submit.isPending}
          >
            <ArrowLeft className="size-4 mr-1.5" /> Back
          </Button>
          {isReview ? (
            <Button
              variant="gold"
              className="flex-1"
              disabled={
                submit.isPending || firstIncompleteStep() !== null
              }
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Saving…" : "Save & publish"}
            </Button>
          ) : (
            <Button
              variant="gold"
              className="flex-1"
              onClick={next}
              disabled={advancing}
            >
              {advancing ? "Saving…" : "Save & continue"}
              <ArrowRight className="size-4 ml-1.5" />
            </Button>
          )}
        </div>
      </div>
    </ScreenLayout>
  );
};

const ReviewBlock = ({
  title,
  rows,
  onEdit,
}: {
  title: string;
  rows: (string | undefined)[][];
  onEdit: () => void;
}) => (
  <SurfaceCard>
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
        {title}
      </p>
      <button
        onClick={onEdit}
        className="text-[11px] font-body text-primary underline underline-offset-2"
      >
        Edit
      </button>
    </div>
    <div className="mt-2 space-y-1.5">
      {rows.map(([label, value], i) => (
        <div key={i} className="flex gap-2 text-[12px] font-body">
          <span className="text-muted-foreground w-[104px] shrink-0">
            {label}
          </span>
          <span
            className={cn(
              "flex-1 whitespace-pre-line break-words",
              !value && "italic text-muted-foreground",
            )}
          >
            {value?.trim() ? value : "Not set"}
          </span>
        </div>
      ))}
    </div>
  </SurfaceCard>
);

export default ProSetup;
