import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, ChevronDown, ImagePlus, Loader2, Mail, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COUNTRIES } from "@/data/countries";
import { HERITAGE_OPTIONS } from "@/data/heritage";
import { isHardWaterPostcode } from "@/data/hardWaterPostcodes";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { convertHeicToJpeg } from "@/lib/imagePrep";

const AVATAR_BUCKET = "avatars";

/** Shared label style. */
const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
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
      "relative flex items-center bg-card rounded-[10px] border transition-colors",
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
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [heritage, setHeritage] = useState("");

  // Profile photo state
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitted, setSubmitted] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");

  // Refs for keyboard "Next" key focus advance.
  const ageRef = useRef<HTMLSelectElement>(null);
  const postcodeRef = useRef<HTMLInputElement>(null);

  const hardWater = useMemo(() => isHardWaterPostcode(postcode), [postcode]);
  const isUK = country === "United Kingdom";

  // Load any existing avatar so users returning to the step see their photo.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const p = data?.avatar_url ?? null;
      setAvatarPath(p);
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
      const newPath = `${user.id}/${crypto.randomUUID()}.${ext}`;
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

  // Per-field validity (only surface errors after submit-attempt).
  const errors = {
    photo: !avatarPath ? "Add a profile photo to continue" : "",
    name: name.trim().length === 0 ? "Enter your full name" : "",
    age: age === "" ? "Select your age" : "",
    postcode:
      postcode.trim().length < 3 ? "Enter a postcode (at least 3 characters)" : "",
    country: !isUK ? "STRAND is only available in the UK right now" : "",
  };
  const canContinue = Object.values(errors).every((e) => e === "");

  const handleContinue = () => {
    setSubmitted(true);
    if (!canContinue) return;
    const payload = {
      name: name.trim(),
      age,
      postcode: postcode.trim().toUpperCase(),
      country,
      heritage,
    };
    sessionStorage.setItem("strand_profile_step1", JSON.stringify(payload));
    // Also persist to localStorage so the Profile page can derive identity & water hardness.
    localStorage.setItem("strand_profile_basic", JSON.stringify(payload));
    // Persist heritage for AI summary / nutrition context
    localStorage.setItem("strand_heritage", JSON.stringify(heritage ? [heritage] : []));
    localStorage.setItem("strand_onboarding_step", "/onboarding/profile-step-2");
    navigate("/onboarding/profile-step-2");
  };

  const handleWaitlistJoin = () => {
    const email = waitlistEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    toast.success("✓ You are on the waitlist — we will email you when we launch.");
    setWaitlistOpen(false);
    setWaitlistEmail("");
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
      <TitleBar title="About You" right={<span>1 of 9</span>} />
      <ProgressDots total={9} current={1} />
      <ItalicSub>This shapes every recommendation Strand makes.</ItalicSub>

      <form
        className="px-5 space-y-4 pb-8"
        onClick={dismissKeyboard}
        onSubmit={(e) => {
          e.preventDefault();
          handleContinue();
        }}
        noValidate
      >
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
            <div
              className={cn(
                "relative size-20 rounded-full overflow-hidden border-2 flex items-center justify-center bg-card shrink-0",
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
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="goldOutline"
                size="pill"
                onClick={() => cameraInputRef.current?.click()}
                disabled={avatarBusy}
                className="!px-2 !text-[11px]"
              >
                <Camera className="size-3.5 mr-1" />
                Take Photo
              </Button>
              <Button
                type="button"
                variant="goldOutline"
                size="pill"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarBusy}
                className="!px-2 !text-[11px]"
              >
                <ImagePlus className="size-3.5 mr-1" />
                Upload
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
                  ageRef.current?.focus();
                }
              }}
              className="w-full bg-transparent px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none rounded-[10px] min-h-[44px]"
            />
            {name.trim().length > 0 && <Check className="size-4 text-good mr-3 shrink-0" />}
          </FieldFrame>
          {submitted && errors.name && <FieldError>{errors.name}</FieldError>}
        </label>

        {/* Age */}
        <label className="block">
          <FieldLabel>Age</FieldLabel>
          <FieldFrame filled={age !== ""} invalid={submitted && !!errors.age}>
            <select
              ref={ageRef}
              value={age}
              onChange={(e) => {
                setAge(e.target.value);
                postcodeRef.current?.focus();
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

        {/* Postcode */}
        <label className="block">
          <FieldLabel>Postcode</FieldLabel>
          <FieldFrame
            filled={postcode.trim().length >= 3}
            invalid={submitted && !!errors.postcode}
          >
            <input
              ref={postcodeRef}
              type="text"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value.toUpperCase())}
              placeholder="e.g. SW6 3BX"
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="next"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.currentTarget.form?.querySelector(
                    'select[name="country"]',
                  ) as HTMLSelectElement | null)?.focus();
                }
              }}
              className="w-full bg-transparent px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none rounded-[10px] uppercase min-h-[44px]"
            />
            {hardWater === true && (
              <span className="bg-primary/15 text-primary text-[10px] uppercase tracking-[0.15em] font-medium px-2 py-1 rounded mr-2 shrink-0">
                Hard water ⚠
              </span>
            )}
            {hardWater === false && (
              <span className="bg-good/15 text-good text-[10px] uppercase tracking-[0.15em] font-medium px-2 py-1 rounded mr-2 shrink-0">
                Soft water ✓
              </span>
            )}
          </FieldFrame>
          {submitted && errors.postcode && <FieldError>{errors.postcode}</FieldError>}
        </label>

        {/* Country */}
        <label className="block">
          <FieldLabel>Country of Residence</FieldLabel>
          <FieldFrame filled={true} invalid={submitted && !isUK}>
            <select
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              autoComplete="country-name"
              className="w-full appearance-none bg-transparent px-3.5 py-3 text-sm text-foreground focus:outline-none rounded-[10px] pr-10 min-h-[44px]"
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown className="size-4 text-muted-foreground absolute right-3 pointer-events-none" />
          </FieldFrame>
          {submitted && errors.country && <FieldError>{errors.country}</FieldError>}
        </label>

        {/* UK-only block */}
        {!isUK && (
          <SurfaceCard tone="orange" className="space-y-3">
            <p className="text-sm leading-snug">
              <span className="font-semibold">STRAND is currently only available in the UK. </span>
              We are working on expanding. Join the waitlist to be notified when we launch in your country.
            </p>
            {!waitlistOpen ? (
              <Button variant="gold" size="pill" onClick={() => setWaitlistOpen(true)} type="button">
                Join Waitlist
              </Button>
            ) : (
              <div className="space-y-2">
                <FieldFrame filled={waitlistEmail.length > 0}>
                  <Mail className="size-4 text-muted-foreground ml-3 shrink-0" />
                  <input
                    type="email"
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    inputMode="email"
                    enterKeyHint="go"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleWaitlistJoin();
                      }
                    }}
                    className="w-full bg-transparent px-2.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none min-h-[44px]"
                  />
                </FieldFrame>
                <div className="flex gap-2">
                  <Button variant="gold" size="pill" onClick={handleWaitlistJoin} type="button">
                    Notify Me
                  </Button>
                  <Button
                    variant="goldGhost"
                    size="pill"
                    onClick={() => setWaitlistOpen(false)}
                    type="button"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </SurfaceCard>
        )}

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

        <Button
          type="submit"
          variant="gold"
          size="pill"
          className="mt-4"
          disabled={!canContinue}
        >
          Continue →
        </Button>
      </form>
    </ScreenLayout>
  );
};

export default ProfileStep1;
