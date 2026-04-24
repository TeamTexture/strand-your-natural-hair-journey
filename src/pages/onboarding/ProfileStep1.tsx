import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, Mail } from "lucide-react";
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
        ? "border-destructive"
        : filled
          ? "border-primary/60"
          : "border-border",
    )}
  >
    {children}
  </div>
);

const ages = Array.from({ length: 80 - 16 + 1 }, (_, i) => 16 + i);

const ProfileStep1 = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [heritage, setHeritage] = useState("");

  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");

  const hardWater = useMemo(() => isHardWaterPostcode(postcode), [postcode]);
  const isUK = country === "United Kingdom";

  const canContinue =
    name.trim().length > 0 &&
    age !== "" &&
    postcode.trim().length >= 3 &&
    isUK;

  const handleContinue = () => {
    if (!canContinue) return;
    // Persist to local state for now — wired into Cloud once schema is built.
    sessionStorage.setItem(
      "strand_profile_step1",
      JSON.stringify({ name: name.trim(), age, postcode: postcode.trim().toUpperCase(), country, heritage }),
    );
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

  return (
    <ScreenLayout>
      <TitleBar title="About You" right={<span>1 of 9</span>} />
      <ProgressDots total={9} current={1} />
      <ItalicSub>This shapes every recommendation Strand makes.</ItalicSub>

      <div className="px-5 space-y-4 pb-8">
        {/* Full Name */}
        <label className="block">
          <FieldLabel>Full Name</FieldLabel>
          <FieldFrame filled={name.trim().length > 0}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              maxLength={100}
              className="w-full bg-transparent px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none rounded-[10px]"
            />
            {name.trim().length > 0 && <Check className="size-4 text-good mr-3 shrink-0" />}
          </FieldFrame>
        </label>

        {/* Age */}
        <label className="block">
          <FieldLabel>Age</FieldLabel>
          <FieldFrame filled={age !== ""}>
            <select
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className={cn(
                "w-full appearance-none bg-transparent px-3.5 py-3 text-sm focus:outline-none rounded-[10px] pr-10",
                age === "" ? "text-muted-foreground/60" : "text-foreground",
              )}
            >
              <option value="" disabled>Select your age</option>
              {ages.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <ChevronDown className="size-4 text-muted-foreground absolute right-3 pointer-events-none" />
          </FieldFrame>
        </label>

        {/* Postcode */}
        <label className="block">
          <FieldLabel>Postcode</FieldLabel>
          <FieldFrame filled={postcode.trim().length >= 3}>
            <input
              type="text"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value.toUpperCase())}
              placeholder="e.g. SW6 3BX"
              maxLength={8}
              className="w-full bg-transparent px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none rounded-[10px] uppercase"
            />
            {hardWater === true && (
              <span className="bg-primary/15 text-primary text-[10px] uppercase tracking-[0.15em] font-medium px-2 py-1 rounded mr-2 shrink-0">
                Hard water ⚠
              </span>
            )}
            {hardWater === false && postcode.trim().length >= 3 && (
              <Check className="size-4 text-good mr-3 shrink-0" />
            )}
          </FieldFrame>
        </label>

        {/* Country */}
        <label className="block">
          <FieldLabel>Country of Residence</FieldLabel>
          <FieldFrame filled={true} invalid={!isUK}>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full appearance-none bg-transparent px-3.5 py-3 text-sm text-foreground focus:outline-none rounded-[10px] pr-10"
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown className="size-4 text-muted-foreground absolute right-3 pointer-events-none" />
          </FieldFrame>
        </label>

        {/* UK-only block */}
        {!isUK && (
          <SurfaceCard tone="orange" className="space-y-3">
            <p className="text-sm leading-snug">
              <span className="font-semibold">STRAND is currently only available in the UK. </span>
              We are working on expanding. Join the waitlist to be notified when we launch in your country.
            </p>
            {!waitlistOpen ? (
              <Button variant="gold" size="pill" onClick={() => setWaitlistOpen(true)}>
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
                    className="w-full bg-transparent px-2.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                  />
                </FieldFrame>
                <div className="flex gap-2">
                  <Button variant="gold" size="pill" onClick={handleWaitlistJoin}>
                    Notify Me
                  </Button>
                  <Button variant="goldGhost" size="pill" onClick={() => setWaitlistOpen(false)}>
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
              className={cn(
                "w-full appearance-none bg-transparent px-3.5 py-3 text-sm focus:outline-none rounded-[10px] pr-10",
                heritage === "" ? "text-muted-foreground/60" : "text-foreground",
              )}
            >
              <option value="">Select if you wish</option>
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
          <p className="mt-1.5 text-[11px] font-script italic text-muted-foreground leading-snug">
            This is never shared and used only to personalise your hair care recommendations.
          </p>
        </label>

        <Button
          variant="gold"
          size="pill"
          className="mt-4"
          disabled={!canContinue}
          onClick={handleContinue}
        >
          Continue →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProfileStep1;
