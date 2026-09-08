import { useMemo, useRef, useState } from "react";
import { toggleWithNone } from "@/lib/healthOptions";
import { useOnboardingDraft } from "@/hooks/useOnboardingDraft";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { onboardingBack } from "@/lib/onboardingFlow";
import OnboardingGuide from "@/components/onboarding/OnboardingGuide";
import OnboardingScreenHeading from "@/components/onboarding/OnboardingScreenHeading";
import OnboardingSectionCard from "@/components/onboarding/OnboardingSectionCard";
import RequiredField, { MissingAnswersCard } from "@/components/onboarding/RequiredField";
import Tag from "@/components/Tag";
import CurlPatternPicker from "@/components/onboarding/CurlPatternPicker";


import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { encryptForStorage } from "@/lib/clinicalContext";
import HairLengthPicker from "@/components/HairLengthPicker";
import { toast } from "sonner";
import { getDisplayedAuthUser } from "@/lib/displayedUser";

/**
 * Maps the self-assessment labels a member picks to the column values a
 * professional would enter, so the stored data stays in the same convention
 * regardless of who captured it. "Not sure" maps to null (unknown) — it
 * satisfies validation without forcing a guess.
 */
export const HAIR_FEEL_MAP = {
  diameter: {
    "I can barely feel it": "Fine",
    "I can feel it clearly": "Medium",
    "Thick and wiry": "Coarse",
    "Different across my head": "Mixed",
    "Not sure": null,
  } as Record<string, string | null>,
  surface_texture: {
    "Smooth all the way": "Silky / glassy",
    "A little grip": "Medium",
    "Bumpy, it catches": "Rough / crinkly",
    "Not sure": null,
  } as Record<string, string | null>,
  density: {
    "A wide band of scalp": "Low",
    "A clear line with a little scalp either side": "Medium",
    "The parting closes up as soon as I let go": "High",
    "Not sure": null,
  } as Record<string, string | null>,
  porosity: {
    "Soaks it up fast": "High",
    "Water beads and sits on top": "Low",
    "Somewhere in between": "Medium",
  } as Record<string, string | null>,
  elasticity: {
    "Stretches and springs back": "Strong",
    "Snaps, or stays stretched": "Weak",
    "Not sure": null,
  } as Record<string, string | null>,
} as const;

export type HairFeelField = keyof typeof HAIR_FEEL_MAP;

/** Convert a picked label to its stored column value (or null for "Not sure"). */
export function mapHairFeelLabel(field: HairFeelField, label: string | undefined): string | null {
  if (!label) return null;
  return HAIR_FEEL_MAP[field][label] ?? null;
}

/**
 * The clinical shorthand shown in brackets after each option, so she learns
 * what her answer means. Presentation only — keyed by the plain option text,
 * which stays the stored/compared value.
 */
const ANNOTATIONS: Record<string, Record<string, string>> = {
  diameter: {
    "I can barely feel it": "fine",
    "I can feel it clearly": "medium",
    "Thick and wiry": "coarse",
    "Different across my head": "mixed",
  },
  surface_texture: {
    "Smooth all the way": "silky",
    "A little grip": "medium",
    "Bumpy, it catches": "rough",
  },
  density: {
    "A wide band of scalp": "low density",
    "A clear line with a little scalp either side": "medium density",
    "The parting closes up as soon as I let go": "high density",
  },
  porosity: {
    "Soaks it up fast": "high porosity",
    "Water beads and sits on top": "low porosity",
    "Somewhere in between": "medium porosity",
  },
  elasticity: {
    "Stretches and springs back": "strong elasticity",
    "Snaps, or stays stretched": "weak elasticity",
  },
};

interface TGProps {
  /** Stable id used for the outstanding-answer list and the scroll target. */
  id: string;
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
  /** When set, this option is affirmative and mutually exclusive with the rest. */
  noneLabel?: string;
  /** What the characteristic IS — a quiet definition block under the question. */
  definition?: string;
  /** How to CHECK it — italic helper line with a gold left border. */
  helper?: string;
  /** The clinical name for what is being asked, shown as a small gold badge
   *  beside the question rather than as part of the question itself. */
  term?: string;
  /** Key into ANNOTATIONS, when this question's options carry shorthand. */
  annotationSet?: keyof typeof ANNOTATIONS;
  invalid: boolean;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}
const TagGroup = ({
  id,
  label,
  options,
  value,
  onChange,
  multi = true,
  noneLabel,
  definition,
  helper,
  term,
  annotationSet,
  invalid,
  registerRef,
}: TGProps) => {
  const safeValue = Array.isArray(value) ? value : [];
  const annotations = annotationSet ? ANNOTATIONS[annotationSet] : undefined;
  const toggle = (opt: string) => {
    if (multi) {
      onChange(noneLabel ? toggleWithNone(safeValue, opt, noneLabel) : safeValue.includes(opt) ? safeValue.filter((v) => v !== opt) : [...safeValue, opt]);
    } else {
      onChange([opt]);
    }
  };
  return (
    <RequiredField
      id={id}
      label={label}
      term={term}
      definition={definition}
      hint={helper}
      answered={safeValue.length > 0}
      invalid={invalid}
      registerRef={registerRef}
    >
      <div className="flex flex-wrap gap-[7px]">
        {options.map((o) => (
          <Tag key={o} selected={safeValue.includes(o)} annotation={annotations?.[o]} onClick={() => toggle(o)}>
            {o}
          </Tag>
        ))}
      </div>
    </RequiredField>
  );
};



/**
 * The simplified self-answer maps for this screen. They write the SAME columns
 * as before, in the same convention a professional would enter, so nothing
 * downstream changes. "Not sure" is a real answer and stores null.
 */
const POROSITY_ANSWERS: Record<string, string | null> = {
  "Soaks in straight away": "High",
  "Water sits on top for a while": "Low",
  "Somewhere in between": "Medium",
  "Not sure": null,
};

const SCALP_SHOWN_ANSWERS: Record<string, string | null> = {
  "A lot": "Low",
  "A little": "Medium",
  "Hardly any": "High",
  "Not sure": null,
};

const LENGTH_BUCKETS = ["Short", "Medium", "Long"];

const ProfileStep3Hair = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // No defaults — a pre-selected answer would be an assumption about her hair
  // and scalp that she never made, so every group starts genuinely empty.
  const [curlPattern, setCurlPattern] = useState<string | null>(null);
  const [porosity, setPorosity] = useState<string[]>([]);
  const [scalp, setScalp] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [density, setDensity] = useState<string[]>([]);
  const [lengthBucket, setLengthBucket] = useState("");
  // Shown only after a failed Continue, so a member is never greeted by red.
  const [showErrors, setShowErrors] = useState(false);

  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const registerRef = (id: string, el: HTMLDivElement | null) => {
    refs.current[id] = el;
  };

  // Keep everything selected on this step if the member navigates back and forth.
  useOnboardingDraft(
    "profile-step-3-hair",
    { curl_pattern: curlPattern, porosity, scalp, areas, density, lengthBucket },
    (d) => {
      // Older saved drafts used different shapes. Only restore values the
      // current controls can render.
      if (typeof d.curl_pattern === "string") setCurlPattern(d.curl_pattern);
      if (Array.isArray(d.porosity)) {
        setPorosity(d.porosity.filter((v): v is string => typeof v === "string" && v in POROSITY_ANSWERS));
      }
      if (Array.isArray(d.scalp)) setScalp(d.scalp.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.areas)) setAreas(d.areas.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.density)) {
        setDensity(d.density.filter((v): v is string => typeof v === "string" && v in SCALP_SHOWN_ANSWERS));
      }
      if (typeof d.lengthBucket === "string" && LENGTH_BUCKETS.includes(d.lengthBucket)) {
        setLengthBucket(d.lengthBucket);
      }
    },
  );

  // Exactly five required answers. Length is never required.
  const missing = useMemo(() => {
    const m: { id: string; label: string }[] = [];
    if (!curlPattern) m.push({ id: "curlPattern", label: "Curl pattern" });
    if (porosity.length === 0) m.push({ id: "porosity", label: "How your hair takes water" });
    if (density.length === 0) m.push({ id: "density", label: "How much scalp shows" });
    if (scalp.length === 0) m.push({ id: "scalp", label: "Scalp condition" });
    if (areas.length === 0) m.push({ id: "areas", label: "Areas of concern" });
    return m;
  }, [curlPattern, porosity, density, scalp, areas]);

  const invalid = (id: string) => showErrors && missing.some((m) => m.id === id);

  const goNext = async () => {
    localStorage.setItem("strand_onboarding_step", "/onboarding/profile-step-4-colour");
    const { data } = await getDisplayedAuthUser();
    await queryClient.invalidateQueries({ queryKey: ["consumer_onboarding_route", data.user?.id] });
    navigate("/onboarding/profile-step-4-colour");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Hair Characteristics" onBack={onboardingBack(navigate, "/onboarding/profile-step-3-hair")} />
      <OnboardingGuide className="pt-2 pb-1" />
      <OnboardingScreenHeading
        title="Your hair, in your own hands"
        subtitle="Five short questions. Answer from what you see and feel — no tests, no wrong answers."
      />

      <div className="px-5 pb-8 space-y-3">
        <OnboardingSectionCard number={1} title="Curl pattern">
          <RequiredField
            id="curlPattern"
            label="Which is your hair most closely matched to?"
            term="Curl pattern"
            hint="Not sure? Give it your best guess — you can book a consultation once you're in the app to confirm it."
            answered={!!curlPattern}
            invalid={invalid("curlPattern")}
            registerRef={registerRef}
          >
            <CurlPatternPicker value={curlPattern} onChange={setCurlPattern} />
          </RequiredField>
        </OnboardingSectionCard>

        <OnboardingSectionCard number={2} title="Water and scalp">
          <div className="space-y-4">
            <TagGroup
              id="porosity"
              multi={false}
              label="When you wet your hair, what happens?"
              term="porosity"
              definition="Porosity is how readily your hair takes in water and lets it go again."
              options={["Soaks in straight away", "Water sits on top for a while", "Somewhere in between", "Not sure"]}
              value={porosity} onChange={setPorosity}
              invalid={invalid("porosity")} registerRef={registerRef}
            />
            <TagGroup
              id="density"
              multi={false}
              label="How much scalp shows when you part your hair?"
              term="density"
              definition="Density is how many strands grow on your head — not how thick each one is."
              options={["A lot", "A little", "Hardly any", "Not sure"]}
              value={density} onChange={setDensity}
              invalid={invalid("density")} registerRef={registerRef}
            />
            <TagGroup
              id="scalp"
              multi={false}
              label="Scalp Condition"
              options={["Dry", "Oily", "Comfortable", "Itchy or sensitive", "Not sure"]}
              value={scalp} onChange={setScalp}
              invalid={invalid("scalp")} registerRef={registerRef}
            />
            <TagGroup
              id="areas"
              label="Areas of Concern"
              helper="Tap “None” if nothing applies — we will not assume it."
              options={["Edges / hairline", "Temples", "Crown", "Nape", "Overall thinning", "None"]}
              value={areas} onChange={setAreas} noneLabel="None"
              invalid={invalid("areas")} registerRef={registerRef}
            />
          </div>
        </OnboardingSectionCard>

        <OnboardingSectionCard number={3} title="Length">
          <div>
            <p className="text-[12px] font-body text-muted-foreground leading-snug mb-2">
              Optional — pick the closest band when your hair is gently pulled straight.
            </p>
            <div className="flex flex-wrap gap-[7px]">
              {LENGTH_BUCKETS.map((b) => (
                <Tag
                  key={b}
                  selected={lengthBucket === b}
                  onClick={() => setLengthBucket(lengthBucket === b ? "" : b)}
                >
                  {b}
                </Tag>
              ))}
            </div>
          </div>
        </OnboardingSectionCard>

        <MissingAnswersCard missing={missing} />

        <section className="rounded-[14px] border border-primary/25 bg-primary/[0.06] p-3.5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/12">
              <Sparkles className="size-3.5 text-primary" aria-hidden />
            </span>
            <p className="text-[12.5px] leading-relaxed text-foreground font-body [overflow-wrap:anywhere]">
              This gets STRAND working today. A vetted STRAND Pro measures the rest at your
              first appointment — book one from the Directory whenever you're ready.
            </p>
          </div>
        </section>

        <Button variant="gold" size="pill" className="mt-4" onClick={async () => {
          if (missing.length > 0) {
            setShowErrors(true);
            refs.current[missing[0].id]?.scrollIntoView({ behavior: "smooth", block: "center" });
            toast.error(`Please answer ${missing[0].label.toLowerCase()} — ${missing.length} question${missing.length === 1 ? "" : "s"} still to go.`);
            return;
          }

          const porosityVal = porosity[0] ? POROSITY_ANSWERS[porosity[0]] ?? null : null;
          const densityVal = density[0] ? SCALP_SHOWN_ANSWERS[density[0]] ?? null : null;
          localStorage.setItem("strand_hair_profile", JSON.stringify({
            curl_pattern: curlPattern,
            porosity: porosityVal ? [porosityVal] : [],
            scalp, areas,
            density: densityVal ? [densityVal] : [],
            length_bucket: lengthBucket,
          }));

          // Dual-write to user_hair_profile. Only the columns this screen owns —
          // diameter, surface texture, elasticity and diagnosed conditions are
          // deliberately omitted so an existing member's values are untouched.
          try {
            const { data: u } = await getDisplayedAuthUser();
            if (u?.user) {
              const enc = await encryptForStorage([
                { id: "scalp", plaintext: scalp[0] ?? "" },
              ]);
              const payload: Record<string, unknown> = {
                user_id: u.user.id,
                curl_pattern: curlPattern,
                porosity: porosityVal,
                density: densityVal,
                scalp_condition_enc: enc.scalp,
                areas_of_concern: areas,
              };
              if (lengthBucket) payload.length_bucket = lengthBucket;
              const { error } = await supabase
                .from("user_hair_profile")
                .upsert(payload as never, { onConflict: "user_id" });
              if (error) throw error;
            }
          } catch (err) {
            console.error("[strand] user_hair_profile upsert failed", err);
            toast.error("Could not save your hair profile. Check your connection.");
            return;
          }
          void goNext();
        }}>
          Continue →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProfileStep3Hair;

