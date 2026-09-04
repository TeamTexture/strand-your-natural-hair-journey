import { uuid } from "@/lib/uuid";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOnboardingDraft } from "@/hooks/useOnboardingDraft";
import { useNavigate } from "react-router-dom";
import { Camera, Check, ChevronDown, ImagePlus, Loader2, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import OnboardingGuide from "@/components/onboarding/OnboardingGuide";
import OnboardingScreenHeading from "@/components/onboarding/OnboardingScreenHeading";
import OnboardingSectionCard from "@/components/onboarding/OnboardingSectionCard";
import SurfaceCard from "@/components/SurfaceCard";
import HardWaterHint from "@/components/HardWaterHint";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COUNTRIES } from "@/data/countries";
import { formatPostalInput, postalCodeError, postalConfigFor } from "@/lib/postalCode";
import { formatUkMobile, isUkMobile, normaliseUkMobile, ukMobileError } from "@/lib/ukMobile";
import { HERITAGE_OPTIONS } from "@/data/heritage";
import { getTrialOfferState } from "@/lib/trialOffer";
import { walledDestination } from "@/lib/trialWall";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { convertHeicToJpeg } from "@/lib/imagePrep";

const AVATAR_BUCKET = "avatars";

/** Shared label style — a real question, not a form field name. */
const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="block font-body text-[14.5px] font-medium leading-[1.3] text-foreground mb-[9px]">
    {children}
  </span>
);

/** Shared frame for an input/select with state-driven border. */
const FieldFrame = ({
  filled,
  invalid,
  children,
}: {
  filled: boolean;
  invalid?: boolean;
  children: React.ReactNode;
}) => (
  <div
    className={cn(
      "relative flex items-center bg-surface-raised rounded-[10px] border transition-colors",
      invalid
        ? "border-[#A04040]"
        : filled
          ? "border-primary/60"
          : "border-border",
    )}
  >
    {children}
  </div>
);

/** Inline error text shown below a field. */
const FieldError = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-1 text-[12px] font-body text-[#A04040]">{children}</p>
);

const ages = Array.from({ length: 80 - 16 + 1 }, (_, i) => 16 + i);

const ProfileStep1 = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [postcode, setPostcode] = useState("");
  // No default: country feeds the hard-water logic, so it must be an explicit answer.
  const [country, setCountry] = useState("");
  const [heritage, setHeritage] = useState("");
  // WhatsApp marketing consent. Always starts false: consent must be affirmative.
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  // The consent timestamp already on file, so a re-save never re-dates consent.
  const [optInAtOnFile, setOptInAtOnFile] = useState<string | null>(null);

  // Profile photo state
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitted, setSubmitted] = useState(false);

  // Refs for keyboard "Next" key focus advance.
  const ageRef = useRef<HTMLSelectElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const postcodeRef = useRef<HTMLInputElement>(null);

  
  const isUK = country === "United Kingdom";

  // Load any existing profile so users returning to the step see their previous values.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    // Hydrate immediately from local cache so the form is never blank on re-entry.
    try {
      const cached = localStorage.getItem("strand_profile_basic");
      if (cached) {
        const p = JSON.parse(cached) as Partial<{
          name: string;
          phone: string;
          age: string | number;
          birth_year: number | null;
          postcode: string;
          country: string;
          heritage: string;
        }>;
        if (p.name) setName((c) => (c.trim() ? c : p.name!));
        if (p.phone) setPhone((c) => (c.trim() ? c : String(p.phone)));
        // Prefer birth_year so age auto-increments each year on birthday rollover.
        if (p.birth_year && Number.isFinite(p.birth_year)) {
          const derived = new Date().getFullYear() - Number(p.birth_year);
          if (derived >= 16 && derived <= 100) {
            setAge((c) => (c ? c : String(derived)));
          }
        } else if (p.age != null && p.age !== "") {
          setAge((c) => (c ? c : String(p.age)));
        }
        if (p.postcode) setPostcode((c) => (c ? c : String(p.postcode).toUpperCase()));
        if (p.country) setCountry(p.country);
        if (p.heritage) setHeritage((c) => (c ? c : p.heritage!));
      }
      const cachedH = localStorage.getItem("strand_heritage");
      if (cachedH) {
        const arr = JSON.parse(cachedH);
        if (Array.isArray(arr) && arr[0]) setHeritage((c) => (c ? c : String(arr[0])));
      }
    } catch {
      /* ignore cache parse errors */
    }

    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, display_name, phone_number, birth_year, postcode, country, heritage, whatsapp_opt_in, whatsapp_opt_in_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const p = data?.avatar_url ?? null;
      setAvatarPath(p);
      // Pre-populate name from sign-up (profiles.display_name or user metadata),
      // but don't overwrite anything the user has already typed on this step.
      const prefillName =
        data?.display_name ||
        (user.user_metadata as { display_name?: string; full_name?: string } | null)?.display_name ||
        (user.user_metadata as { full_name?: string } | null)?.full_name ||
        "";
      if (prefillName) {
        setName((current) => (current.trim() ? current : prefillName));
      }
      if (data?.phone_number) {
        setPhone((current) =>
          current.trim() ? current : formatUkMobile(String(data.phone_number)) || String(data.phone_number),
        );
      }
      if (data?.birth_year && Number.isFinite(data.birth_year)) {
        const derivedAge = new Date().getFullYear() - data.birth_year;
        if (derivedAge >= 16 && derivedAge <= 100) {
          setAge((current) => (current ? current : String(derivedAge)));
        }
      }
      if (data?.postcode) {
        setPostcode((current) => (current ? current : String(data.postcode).toUpperCase()));
      }
      if (data?.country) {
        setCountry(data.country);
      }
      const h = (data as { heritage?: string[] | null } | null)?.heritage;
      if (Array.isArray(h) && h[0]) {
        setHeritage((current) => (current ? current : String(h[0])));
      }
      // Only an existing "yes" on file ever ticks the box.
      if ((data as { whatsapp_opt_in?: boolean | null } | null)?.whatsapp_opt_in === true) {
        setWhatsappOptIn(true);
        const at = (data as { whatsapp_opt_in_at?: string | null } | null)?.whatsapp_opt_in_at;
        if (at) setOptInAtOnFile(at);
      }
      if (p) {
        const { data: sig } = await supabase.storage
          .from(AVATAR_BUCKET)
          .createSignedUrl(p, 3600);
        if (!cancelled) setAvatarUrl(sig?.signedUrl ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // If routed here with #postcode, scroll to and focus the postcode input.
  // Keep anything typed on this step if the member navigates away and returns.
  useOnboardingDraft(
    "profile-step-1",
    { name, phone, age, postcode, country, heritage, whatsappOptIn },
    (d) => {
      if (d.name) setName(d.name);
      if (d.phone) setPhone(d.phone);
      if (d.age) setAge(d.age);
      if (d.postcode) setPostcode(d.postcode);
      if (d.country) setCountry(d.country);
      if (d.heritage) setHeritage(d.heritage);
      if (d.whatsappOptIn === true) setWhatsappOptIn(true);
    },
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#postcode") return;
    const t = setTimeout(() => {
      const el = postcodeRef.current;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
    }, 250);
    return () => clearTimeout(t);
  }, []);

  const handlePickPhoto = async (rawFile: File | undefined) => {
    if (!rawFile) return;
    if (!user) {
      toast.error("Please sign in to add a photo");
      return;
    }
    const isHeic = /\.(heic|heif)$/i.test(rawFile.name) || /heic|heif/i.test(rawFile.type);
    if (!rawFile.type.startsWith("image/") && !isHeic) {
      toast.error("Pick an image file");
      return;
    }
    if (rawFile.size > 8 * 1024 * 1024) {
      toast.error("Photo too large (max 8MB)");
      return;
    }
    setAvatarBusy(true);
    try {
      const file = await convertHeicToJpeg(rawFile);
      if (avatarPath) await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath]);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const newPath = `${user.id}/${uuid()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(newPath, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase
        .from("profiles")
        .upsert({ user_id: user.id, avatar_url: newPath }, { onConflict: "user_id" });
      if (dbErr) throw dbErr;
      const { data: sig } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(newPath, 3600);
      setAvatarPath(newPath);
      setAvatarUrl(sig?.signedUrl ?? null);
      toast.success("Photo added");
    } catch (e) {
      console.error("Avatar upload failed:", e);
      toast.error("Could not upload photo");
    } finally {
      setAvatarBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!user || !avatarPath) return;
    setAvatarBusy(true);
    try {
      await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath]);
      await supabase
        .from("profiles")
        .upsert({ user_id: user.id, avatar_url: null }, { onConflict: "user_id" });
      setAvatarPath(null);
      setAvatarUrl(null);
    } catch (e) {
      console.error("Remove avatar failed:", e);
    } finally {
      setAvatarBusy(false);
    }
  };

  const postalConfig = postalConfigFor(country);
  // Per-field validity (only surface errors after submit-attempt).
  // UK mobile only: validated inline here and mirrored by a CHECK constraint
  // on profiles.phone_number, so the stored value is always +447XXXXXXXXX.
  const phoneValid = isUkMobile(phone);
  const errors = {
    photo: !avatarPath ? "Add a profile photo to continue" : "",
    name: name.trim().length === 0 ? "Enter your full name" : "",
    phone: ukMobileError(phone),
    age: age === "" ? "Select your age" : "",
    // Postcode rules follow the declared country: strict for the UK (it drives
    // the hard-water lookup) and permissive for formats we haven't mapped.
    postcode: postalCodeError(postcode, country),
    // A non-UK country no longer blocks the step: the details are saved and the
    // member is routed to the international waiting-list splash afterwards.
    country: country === "" ? "Select your country of residence" : "",
  };
  const canContinue = Object.values(errors).every((e) => e === "");

  const FIELD_LABELS: Record<keyof typeof errors, string> = {
    photo: "your profile photo",
    name: "your full name",
    phone: "your mobile number",
    age: "your age",
    postcode: `your ${postalConfig.noun}`,
    country: "your country of residence",
  };

  const handleContinue = async () => {
    setSubmitted(true);
    if (!canContinue) {
      const missing = (Object.keys(errors) as Array<keyof typeof errors>).filter(
        (k) => errors[k] !== "",
      );
      if (missing.length) {
        toast.error(
          `Please add ${FIELD_LABELS[missing[0]]} — ${missing.length} question${missing.length === 1 ? "" : "s"} still to go.`,
        );
      }
      return;
    }
    const trimmedPostcode = postcode.trim().toUpperCase();
    const heritageArr = heritage ? [heritage] : [];
    const ageNumForPayload = age === "" ? null : parseInt(String(age), 10);
    const birthYearForPayload =
      ageNumForPayload != null && Number.isFinite(ageNumForPayload) && ageNumForPayload >= 1 && ageNumForPayload <= 120
        ? new Date().getFullYear() - ageNumForPayload
        : null;
    const trimmedPhone = normaliseUkMobile(phone) ?? "";
    if (!trimmedPhone) {
      toast.error("Enter a valid UK mobile number.");
      return;
    }
    const payload = {
      name: name.trim(),
      phone: trimmedPhone,
      age,
      birth_year: birthYearForPayload,
      postcode: trimmedPostcode,
      country,
      heritage,
    };
    sessionStorage.setItem("strand_profile_step1", JSON.stringify(payload));
    // Also persist to localStorage so the Profile page can derive identity & water hardness.
    localStorage.setItem("strand_profile_basic", JSON.stringify(payload));
    // Persist heritage for AI summary / nutrition context
    localStorage.setItem("strand_heritage", JSON.stringify(heritageArr));
    localStorage.setItem("strand_onboarding_step", "/onboarding/profile-step-2");

    // Dual-write to profiles. PHASE_1_PLAN.md §15.
    if (user) {
      const ageNum = age === "" ? null : parseInt(String(age), 10);
      const birth_year =
        ageNum != null && Number.isFinite(ageNum) && ageNum >= 1 && ageNum <= 120
          ? new Date().getFullYear() - ageNum
          : null;
      const update: {
        display_name: string;
        phone_number: string | null;
        heritage: string[];
        postcode: string;
        country: string;
        birth_year?: number;
        whatsapp_opt_in: boolean;
        whatsapp_opt_in_at: string | null;
      } = {
        display_name: name.trim(),
        phone_number: trimmedPhone || null,
        heritage: heritageArr,
        postcode: trimmedPostcode,
        country,
        whatsapp_opt_in: whatsappOptIn,
        // Stamped when she first says yes, kept as-is on a re-save, cleared on no.
        whatsapp_opt_in_at: whatsappOptIn
          ? (optInAtOnFile ?? new Date().toISOString())
          : null,
      };
      if (birth_year !== null) update.birth_year = birth_year;
      try {
        const { error } = await supabase
          .from("profiles")
          .upsert(
            { user_id: user.id, ...update },
            { onConflict: "user_id" },
          );
        if (error) throw error;
      } catch (err) {
        console.warn("[strand] profiles upsert (step 1) failed", err);
        toast.error("Could not save your profile. Your answers are still here — please try again.");
        return;
      }

    }

    // Registration details are now on file. The declared country decides the
    // branch: a UK member gets the "two steps left" email, a member outside the
    // UK is flagged, added to the waiting list and emailed instead.
    const checkBody = { declared_country: country, name: name.trim(), phone: trimmedPhone };
    if (!isUK) {
      try {
        await supabase.functions.invoke("international-check", { body: checkBody });
      } catch (err) {
        console.error("[gate] declared-country check failed", err);
      }
      await queryClient.invalidateQueries({ queryKey: ["international-block", user?.id] });
      navigate("/home", { replace: true });
      return;
    }

    // UK: don't hold the member on this screen for the email — fire and go.
    void supabase.functions
      .invoke("international-check", { body: checkBody })
      .catch((err) => console.error("[gate] declared-country check failed", err));

    await queryClient.invalidateQueries({ queryKey: ["consumer_onboarding_route", user?.id] });
    // About You is in: the optional attribution question, then the paywall, is
    // the very next screen for a stamped member with no membership. Never step 3.
    const trialState = user ? await getTrialOfferState(user.id) : null;
    navigate(
      trialState?.walled
        ? walledDestination({
            basicComplete: true,
            goalCaptured: true,
            acquisitionAnswered: trialState.acquisitionAnswered,
          })
        : "/onboarding/profile-step-2",
    );

  };


  // Tap outside any input to dismiss the keyboard on mobile.
  const dismissKeyboard = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (!target.closest("input, select, textarea, button")) {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="About You" back={false} />
      <OnboardingGuide className="pt-2 pb-1" />
      <OnboardingScreenHeading
        title="A little about you"
        subtitle="This shapes every recommendation Strand makes."
      />

      <form
        className="px-5 space-y-3 pb-8"
        onClick={dismissKeyboard}
        onSubmit={(e) => {
          e.preventDefault();
          void handleContinue();
        }}
        noValidate
      >
        <OnboardingSectionCard number={1} title="Your photo">
        {/* Profile Photo */}
        <div>
          <FieldLabel>Profile Photo</FieldLabel>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            capture="user"
            className="hidden"
            onChange={(e) => {
              handlePickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => {
              handlePickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => !avatarBusy && fileInputRef.current?.click()}
              disabled={avatarBusy}
              aria-label={avatarUrl ? "Change profile photo" : "Add profile photo"}
              className={cn(
                "relative size-20 rounded-full overflow-hidden border-2 flex items-center justify-center bg-card shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                !avatarBusy && "hover:border-primary cursor-pointer",
                submitted && errors.photo
                  ? "border-[#A04040]"
                  : avatarUrl
                    ? "border-primary/60"
                    : "border-dashed border-primary/50",
              )}
            >
              {avatarBusy ? (
                <Loader2 className="size-5 text-primary animate-spin" />
              ) : avatarUrl ? (
                <img src={avatarUrl} alt="Your profile" className="size-full object-cover" />
              ) : (
                <Camera className="size-6 text-primary/70" />
              )}
            </button>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="goldOutline"
                size="pill"
                className="!px-2 !gap-1.5 !min-h-[40px] !text-[10px] !tracking-wide"
                onClick={() => cameraInputRef.current?.click()}
                disabled={avatarBusy}
              >
                Take Photo
                <Camera className="size-3" />
              </Button>
              <Button
                type="button"
                variant="goldOutline"
                size="pill"
                className="!px-2 !gap-1.5 !min-h-[40px] !text-[10px] !tracking-wide"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarBusy}
              >
                Upload
                <ImagePlus className="size-3" />
              </Button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={removePhoto}
                  disabled={avatarBusy}
                  className="col-span-2 text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1 mt-0.5"
                >
                  <X className="size-3" /> Remove photo
                </button>
              )}
            </div>
          </div>
          {submitted && errors.photo && <FieldError>{errors.photo}</FieldError>}
        </div>
        </OnboardingSectionCard>

        <OnboardingSectionCard number={2} title="Your details">
        <div className="space-y-4">
        {/* Full Name */}
        <label className="block">
          <FieldLabel>Full Name</FieldLabel>
          <FieldFrame
            filled={name.trim().length > 0}
            invalid={submitted && !!errors.name}
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              maxLength={100}
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  phoneRef.current?.focus();
                }
              }}
              className="w-full bg-transparent px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none rounded-[10px] min-h-[44px]"
            />
            {name.trim().length > 0 && <Check className="size-4 text-good mr-3 shrink-0" />}
          </FieldFrame>
          {submitted && errors.name && <FieldError>{errors.name}</FieldError>}
        </label>

        {/* Mobile Number */}
        <label className="block">
          <FieldLabel>Mobile Number <span className="text-primary">*</span></FieldLabel>
          <FieldFrame
            filled={phoneValid}
            invalid={submitted && !!errors.phone}
          >
            <input
              ref={phoneRef}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 07700 900123"
              onBlur={() => setPhone((v) => formatUkMobile(v) || v)}
              maxLength={20}
              autoComplete="tel"
              inputMode="tel"
              enterKeyHint="next"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ageRef.current?.focus();
                }
              }}
              className="w-full bg-transparent px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none rounded-[10px] min-h-[44px]"
            />
            {phoneValid && <Check className="size-4 text-good mr-3 shrink-0" />}
          </FieldFrame>
          {submitted && errors.phone && <FieldError>{errors.phone}</FieldError>}
        </label>

        {/* WhatsApp opt-in — affirmative consent only, never pre-ticked, never required. */}
        <div>
          <button
            type="button"
            onClick={() => setWhatsappOptIn((v) => !v)}
            aria-pressed={whatsappOptIn}
            className="flex items-start gap-2.5 text-left w-full"
          >
            <span
              className={cn(
                "mt-[1px] size-5 rounded-[6px] border flex items-center justify-center shrink-0 transition-colors",
                whatsappOptIn
                  ? "bg-primary border-primary"
                  : "bg-transparent border-primary/60",
              )}
            >
              {whatsappOptIn && <Check className="size-3.5 text-primary-foreground" strokeWidth={3} />}
            </span>
            <span className="font-body text-[13px] leading-[1.35] text-foreground">
              Send me STRAND tips, live sessions and offers on WhatsApp. You can reply STOP at any time.
            </span>
          </button>
          <p className="mt-1.5 pl-[30px] font-body text-[11px] leading-[1.35] text-muted-foreground">
            We only use your number for STRAND messages. Never shared.
          </p>
        </div>


        {/* Age */}
        <label className="block">
          <FieldLabel>Age</FieldLabel>
          <FieldFrame filled={age !== ""} invalid={submitted && !!errors.age}>
            <select
              ref={ageRef}
              value={age}
              onChange={(e) => {
                setAge(e.target.value);
                (e.currentTarget.form?.querySelector(
                  'select[name="country"]',
                ) as HTMLSelectElement | null)?.focus();
              }}
              autoComplete="off"
              className={cn(
                "w-full appearance-none bg-transparent px-3.5 py-3 text-sm focus:outline-none rounded-[10px] pr-10 min-h-[44px]",
                age === "" ? "text-muted-foreground/60" : "text-foreground",
              )}
            >
              <option value="" disabled>
                Select one
              </option>
              {ages.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <ChevronDown className="size-4 text-muted-foreground absolute right-3 pointer-events-none" />
          </FieldFrame>
          {submitted && errors.age && <FieldError>{errors.age}</FieldError>}
        </label>
        </div>
        </OnboardingSectionCard>

        <OnboardingSectionCard number={3} title="Where you live">
        <div className="space-y-4">
        {/* Country */}
        <label className="block">
          <FieldLabel>Country of Residence</FieldLabel>
          <FieldFrame filled={country !== ""} invalid={submitted && !!errors.country}>
            <select
              name="country"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                postcodeRef.current?.focus();
              }}
              autoComplete="country-name"
              className={cn(
                "w-full appearance-none bg-transparent px-3.5 py-3 text-sm focus:outline-none rounded-[10px] pr-10 min-h-[44px]",
                country === "" ? "text-muted-foreground/60" : "text-foreground",
              )}
            >
              <option value="" disabled>
                Select your country…
              </option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown className="size-4 text-muted-foreground absolute right-3 pointer-events-none" />
          </FieldFrame>
          {submitted && errors.country && <FieldError>{errors.country}</FieldError>}
        </label>

        {/* Postal code — label, placeholder and validation follow the country. */}
        <label className="block">
          <FieldLabel>{postalConfig.label}</FieldLabel>
          <FieldFrame
            filled={postcode.trim().length >= postalConfig.minLength}
            invalid={submitted && !!errors.postcode}
          >
            <input
              ref={postcodeRef}
              type="text"
              value={postcode}
              onChange={(e) => setPostcode(formatPostalInput(e.target.value, country))}
              placeholder={postalConfig.placeholder}
              maxLength={postalConfig.maxLength}
              autoComplete="postal-code"
              autoCapitalize={postalConfig.uppercase ? "characters" : "off"}
              spellCheck={false}
              enterKeyHint="next"
              className={cn(
                "w-full bg-transparent px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none rounded-[10px] min-h-[44px]",
                postalConfig.uppercase && "uppercase",
              )}
            />
          </FieldFrame>
          {submitted && errors.postcode && <FieldError>{errors.postcode}</FieldError>}
          {isUK && <HardWaterHint postcode={postcode} />}
        </label>

        {/* Outside the UK — details are still saved, then the member is shown
            the waiting-list splash instead of onboarding. */}
        {country !== "" && !isUK && (
          <SurfaceCard tone="orange">
            <p className="text-sm leading-snug">
              <span className="font-semibold">STRAND isn't in {country} yet. </span>
              Continue and we'll add you to the waiting list — we'll email you the moment we launch there.
            </p>
          </SurfaceCard>
        )}
        </div>
        </OnboardingSectionCard>

        <OnboardingSectionCard number={4} title="Heritage">
        {/* Heritage */}
        <label className="block">
          <FieldLabel>
            Heritage / Ethnicity{" "}
            <span className="normal-case tracking-normal text-muted-foreground/80">
              (voluntary — helps us personalise your guidance)
            </span>
          </FieldLabel>
          <FieldFrame filled={heritage !== ""}>
            <select
              value={heritage}
              onChange={(e) => setHeritage(e.target.value)}
              autoComplete="off"
              className={cn(
                "w-full appearance-none bg-transparent px-3.5 py-3 text-sm focus:outline-none rounded-[10px] pr-10 min-h-[44px]",
                heritage === "" ? "text-muted-foreground/60" : "text-foreground",
              )}
            >
              <option value="">Select one</option>
              {HERITAGE_OPTIONS.map((opt, i) =>
                opt.kind === "header" ? (
                  <option key={`h-${i}`} disabled>
                    — {opt.label} —
                  </option>
                ) : (
                  <option key={opt.value} value={opt.value}>
                    {opt.value}
                  </option>
                ),
              )}
            </select>
            <ChevronDown className="size-4 text-muted-foreground absolute right-3 pointer-events-none" />
          </FieldFrame>
          <p className="mt-1.5 text-[11px] font-body text-muted-foreground leading-snug">
            This is never shared and used only to personalise your hair care recommendations.
          </p>
        </label>
        </OnboardingSectionCard>


        {/* Never disabled: a silent disabled button is a dead-end on the very
            first screen every new member sees. Tapping it surfaces exactly
            which field is missing (handleContinue → toast + inline errors). */}
        <Button
          type="submit"
          variant="gold"
          size="pill"
          className="mt-4"
        >
          Continue →
        </Button>
      </form>
    </ScreenLayout>
  );
};

export default ProfileStep1;
