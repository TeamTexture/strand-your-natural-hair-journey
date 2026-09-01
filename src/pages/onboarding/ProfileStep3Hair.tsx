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



const ProfileStep3Hair = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // No defaults — a pre-selected answer would be an assumption about her hair
  // and scalp that she never made, so every group starts genuinely empty.
  const [curlPattern, setCurlPattern] = useState<string | null>(null);
  const [porosity, setPorosity] = useState<string[]>([]);
  const [elasticity, setElasticity] = useState<string[]>([]);
  const [scalp, setScalp] = useState<string[]>([]);
  const [diagnosed, setDiagnosed] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  // Feel & look — self-assessed. State holds the picked label; the column
  // value is derived at save time via mapHairFeelLabel so the stored data
  // matches a professional capture. "Not sure" is a valid answer (→ null).
  const [diameter, setDiameter] = useState<string[]>([]);
  const [surfaceTexture, setSurfaceTexture] = useState<string[]>([]);
  const [density, setDensity] = useState<string[]>([]);
  const [lengthInches, setLengthInches] = useState("");
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
    { curl_pattern: curlPattern, porosity, elasticity, scalp, diagnosed, areas, diameter, surfaceTexture, density, lengthInches, lengthBucket },
    (d) => {
      // Older saved drafts used different shapes. Only restore values the
      // current controls can render; malformed arrays previously crashed on
      // `.includes()` immediately after a refresh.
      if (typeof d.curl_pattern === "string") setCurlPattern(d.curl_pattern);
      if (Array.isArray(d.porosity)) setPorosity(d.porosity.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.elasticity)) setElasticity(d.elasticity.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.scalp)) setScalp(d.scalp.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.diagnosed)) setDiagnosed(d.diagnosed.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.areas)) setAreas(d.areas.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.diameter)) setDiameter(d.diameter.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.surfaceTexture)) setSurfaceTexture(d.surfaceTexture.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.density)) setDensity(d.density.filter((v): v is string => typeof v === "string"));
      if (typeof d.lengthInches === "string") setLengthInches(d.lengthInches);
      if (typeof d.lengthBucket === "string") setLengthBucket(d.lengthBucket);
    },
  );

  // Every question here stays required — we never assume a member has nothing
  // to declare. The list below is what makes the ask visible instead.
  const missing = useMemo(() => {
    const m: { id: string; label: string }[] = [];
    if (!curlPattern) m.push({ id: "curlPattern", label: "Curl pattern" });
    if (diameter.length === 0) m.push({ id: "diameter", label: "Strand diameter" });
    if (surfaceTexture.length === 0) m.push({ id: "surfaceTexture", label: "Surface texture" });
    if (density.length === 0) m.push({ id: "density", label: "Density" });
    if (porosity.length === 0) m.push({ id: "porosity", label: "Porosity" });
    if (elasticity.length === 0) m.push({ id: "elasticity", label: "Elasticity" });
    if (scalp.length === 0) m.push({ id: "scalp", label: "Scalp condition" });
    if (diagnosed.length === 0) m.push({ id: "diagnosed", label: "Diagnosed conditions" });
    if (areas.length === 0) m.push({ id: "areas", label: "Areas of concern" });
    return m;
  }, [curlPattern, diameter, surfaceTexture, density, porosity, elasticity, scalp, diagnosed, areas]);

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
        subtitle="Five short sections. Answer from what you know — you can refine any of it later with a professional."
      />

      <div className="px-5 pb-8 space-y-3">
        <OnboardingSectionCard number={1} title="Curl pattern">
          <OnboardingQuestion term="Curl pattern" helper="Not sure? Give it your best guess — you can book a consultation once you're in the app to confirm it.">
            Which is your hair most closely matched to?
          </OnboardingQuestion>
          <CurlPatternPicker value={curlPattern} onChange={setCurlPattern} />
        </OnboardingSectionCard>

        <OnboardingSectionCard number={2} title="Feel and look">
          <div className="space-y-4">
            <TagGroup
              multi={false}
              label="Roll one strand between your finger and thumb"
              term="strand diameter"
              annotationSet="diameter"
              definition="Strand diameter is how thick a single hair is, from the finest to the coarsest."
              options={["I can barely feel it", "I can feel it clearly", "Thick and wiry", "Different across my head", "Not sure"]}
              value={diameter} onChange={setDiameter}
            />
            <TagGroup
              multi={false}
              label="Slide your fingers down a strand, root to tip"
              term="surface texture"
              annotationSet="surface_texture"
              definition="Surface texture is how smooth or uneven the outside of a strand feels along its length."
              options={["Smooth all the way", "A little grip", "Bumpy, it catches", "Not sure"]}
              value={surfaceTexture} onChange={setSurfaceTexture}
            />
            <TagGroup
              multi={false}
              label="Part your hair and look along the line"
              term="density"
              annotationSet="density"
              definition="Density is how many strands grow on your head — not how thick each one is."
              helper="Make a parting with a comb, then look at how much scalp shows along it."
              options={["A wide band of scalp", "A clear line with a little scalp either side", "The parting closes up as soon as I let go", "Not sure"]}
              value={density} onChange={setDensity}
            />
          </div>
        </OnboardingSectionCard>

        <OnboardingSectionCard number={3} title="Water and stretch">
          <div className="space-y-4">
            <TagGroup
              multi={false}
              label="How your hair takes water"
              term="porosity"
              annotationSet="porosity"
              definition="Porosity is how readily your hair takes in water and lets it go again."
              options={["Soaks it up fast", "Water beads and sits on top", "Somewhere in between"]}
              value={porosity} onChange={setPorosity}
            />
            <TagGroup
              multi={false}
              label="How a wet strand behaves when you stretch it"
              term="elasticity"
              annotationSet="elasticity"
              definition="Elasticity is how far a wet strand can stretch and come back without breaking."
              options={["Stretches and springs back", "Snaps, or stays stretched", "Not sure"]}
              value={elasticity} onChange={setElasticity}
            />
          </div>

        </OnboardingSectionCard>

        <OnboardingSectionCard number={4} title="Scalp and concerns">
          <div className="space-y-4">
            <TagGroup multi={false} label="Scalp Condition" options={["Dry", "Oily", "Normal", "Sensitive", "Combination"]} value={scalp} onChange={setScalp} />
            <TagGroup
              label="Diagnosed Conditions"
              options={[
                "Traction alopecia", "Androgenetic alopecia", "Alopecia areata", "CCCA",
                "Telogen effluvium", "Seborrheic dermatitis", "Folliculitis",
                "Scalp psoriasis", "Scalp eczema", "None diagnosed",
              ]}
              value={diagnosed} onChange={setDiagnosed} noneLabel="None diagnosed"
            />
            <TagGroup
              label="Areas of Concern"
              options={["Edges / hairline", "Temples", "Crown", "Nape", "Overall thinning", "None"]}
              value={areas} onChange={setAreas} noneLabel="None"
            />
          </div>
        </OnboardingSectionCard>

        <OnboardingSectionCard number={5} title="Length">
          <HairLengthPicker
            inches={lengthInches}
            bucket={lengthBucket}
            onChange={({ inches, bucket }) => {
              setLengthInches(inches);
              setLengthBucket(bucket);
            }}
          />
        </OnboardingSectionCard>




        <Button variant="gold" size="pill" className="mt-4" onClick={async () => {
          const gaps: string[] = [];
          if (!curlPattern) gaps.push("which pattern your hair most closely matches");
          if (diameter.length === 0) gaps.push("rolling a strand between your fingers");
          if (surfaceTexture.length === 0) gaps.push("sliding your fingers down a strand");
          if (density.length === 0) gaps.push("parting your hair and looking along the line");
          if (porosity.length === 0) gaps.push("how your hair takes water");
          if (elasticity.length === 0) gaps.push("how a wet strand behaves");
          if (scalp.length === 0) gaps.push("scalp condition");
          if (diagnosed.length === 0) gaps.push("diagnosed conditions");
          if (areas.length === 0) gaps.push("areas of concern");
          if (gaps.length > 0) {
            toast.error(`Please answer ${gaps[0]} — ${gaps.length} question${gaps.length === 1 ? "" : "s"} still to go.`);
            return;
          }
          // Map the self-assessed labels to the column values a professional
          // would enter, so downstream consumers see the same convention.
          const diameterVal = mapHairFeelLabel("diameter", diameter[0]);
          const surfaceTextureVal = mapHairFeelLabel("surface_texture", surfaceTexture[0]);
          const densityVal = mapHairFeelLabel("density", density[0]);
          const porosityVal = mapHairFeelLabel("porosity", porosity[0]);
          const elasticityVal = mapHairFeelLabel("elasticity", elasticity[0]);
          localStorage.setItem("strand_hair_profile", JSON.stringify({
            curl_pattern: curlPattern,
            porosity: porosityVal ? [porosityVal] : [],
            elasticity: elasticityVal ? [elasticityVal] : [],
            scalp, diagnosed, areas,
            diameter: diameterVal ? [diameterVal] : [],
            texture: surfaceTextureVal ? [surfaceTextureVal] : [],
            density: densityVal ? [densityVal] : [],
            length_inches: lengthInches, length_bucket: lengthBucket,
          }));

          // Dual-write to user_hair_profile. PHASE_1_PLAN.md §15.
          try {
            const { data: u } = await getDisplayedAuthUser();
            if (u?.user) {
              const enc = await encryptForStorage([
                { id: "scalp", plaintext: scalp[0] ?? "" },
                { id: "diagnosed", plaintext: JSON.stringify(diagnosed) },
              ]);
              const inchesNum = Number(lengthInches);
              const { error } = await supabase
                .from("user_hair_profile")
                .upsert(
                  {
                    user_id: u.user.id,
                    curl_pattern: curlPattern,
                    porosity: porosityVal,
                    elasticity: elasticityVal,

                    diameter: diameterVal,
                    surface_texture: surfaceTextureVal,
                    density: densityVal,
                    scalp_condition_enc: enc.scalp,
                    diagnosed_conditions_enc: enc.diagnosed,
                    areas_of_concern: areas,
                    length_inches: Number.isFinite(inchesNum) && inchesNum > 0 ? inchesNum : null,
                    length_bucket: lengthBucket || null,
                  } as never,
                  { onConflict: "user_id" },
                );
              if (error) throw error;
            }
          } catch (err) {
            console.error("[strand] user_hair_profile upsert failed", err);
            toast.error("Could not save your hair profile. Check your connection.");
            return;
          }
          // The personalised-offers ask no longer lives in onboarding — it is a
          // dismissible card on /home, shown only once she is subscribed.
           void goNext();
        }}>
          Continue →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProfileStep3Hair;
