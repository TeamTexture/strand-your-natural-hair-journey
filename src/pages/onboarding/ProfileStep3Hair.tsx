import { useState } from "react";
import { toggleWithNone } from "@/lib/healthOptions";
import { useOnboardingDraft } from "@/hooks/useOnboardingDraft";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { onboardingBack } from "@/lib/onboardingFlow";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import LevelGate from "@/components/tips/LevelGate";
import Tag from "@/components/Tag";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { encryptForStorage } from "@/lib/clinicalContext";
import HairLengthPicker from "@/components/HairLengthPicker";
import { toast } from "sonner";
import PersonalisedOffersPrompt from "@/components/consent/PersonalisedOffersPrompt";
import { usePersonalisedOffersAsk } from "@/hooks/usePersonalisedOffersAsk";

interface TGProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
  /** When set, this option is affirmative and mutually exclusive with the rest. */
  noneLabel?: string;
}
const TagGroup = ({ label, options, value, onChange, multi = true, noneLabel }: TGProps) => {
  const toggle = (opt: string) => {
    if (multi) {
      onChange(noneLabel ? toggleWithNone(value, opt, noneLabel) : value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
    } else {
      onChange([opt]);
    }
  };
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Tag key={o} selected={value.includes(o)} onClick={() => toggle(o)}>
            {o}
          </Tag>
        ))}
      </div>
    </div>
  );
};

const ProfileStep3Hair = () => {
  const navigate = useNavigate();
  // No defaults — these are clinical markers taken from the member's
  // consultation, so a pre-selected answer would be a fabricated diagnosis.
  const [diameter, setDiameter] = useState<string[]>([]);
  const [texture, setTexture] = useState<string[]>([]);
  const [density, setDensity] = useState<string[]>([]);
  const [porosity, setPorosity] = useState<string[]>([]);
  const [elasticity, setElasticity] = useState<string[]>([]);
  const [scalp, setScalp] = useState<string[]>([]);
  const [diagnosed, setDiagnosed] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [lengthInches, setLengthInches] = useState("");
  const [lengthBucket, setLengthBucket] = useState("");

  // Keep everything selected on this step if the member navigates back and forth.
  useOnboardingDraft(
    "profile-step-3-hair",
    { diameter, texture, density, porosity, elasticity, scalp, diagnosed, areas, lengthInches, lengthBucket },
    (d) => {
      // Older saved drafts used different shapes. Only restore values the
      // current controls can render; malformed arrays previously crashed on
      // `.includes()` immediately after a refresh.
      if (Array.isArray(d.diameter)) setDiameter(d.diameter.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.texture)) setTexture(d.texture.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.density)) setDensity(d.density.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.porosity)) setPorosity(d.porosity.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.elasticity)) setElasticity(d.elasticity.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.scalp)) setScalp(d.scalp.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.diagnosed)) setDiagnosed(d.diagnosed.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.areas)) setAreas(d.areas.filter((v): v is string => typeof v === "string"));
      if (typeof d.lengthInches === "string") setLengthInches(d.lengthInches);
      if (typeof d.lengthBucket === "string") setLengthBucket(d.lengthBucket);
    },
  );
  const { shouldAsk } = usePersonalisedOffersAsk();
  const [askOffers, setAskOffers] = useState(false);

  const goNext = () => {
    localStorage.setItem("strand_onboarding_step", "/onboarding/profile-step-4-colour");
    navigate("/onboarding/profile-step-4-colour");
  };


  return (
    <ScreenLayout>
      <TitleBar title="Hair Characteristics" onBack={onboardingBack(navigate, "/onboarding/profile-step-3-hair")} right={<span>5 of 9</span>} />
      <ProgressDots total={9} current={5} />
      <LevelGate min={2}><ItalicSub>Fill these in from your consultation notes. These are the real clinical markers — not curl typing.</ItalicSub></LevelGate>

      <div className="px-5 pb-8 space-y-5">
        <TagGroup multi={false} label="Strand Diameter" options={["Fine", "Medium", "Coarse", "Mixed"]} value={diameter} onChange={setDiameter} />
        <TagGroup multi={false} label="Surface Texture" options={["Rough / crinkly", "Medium", "Silky / glassy"]} value={texture} onChange={setTexture} />
        <TagGroup multi={false} label="Density" options={["Low", "Medium", "High"]} value={density} onChange={setDensity} />
        <TagGroup multi={false} label="Porosity" options={["Low — tightly closed cuticle", "High — raised cuticle"]} value={porosity} onChange={setPorosity} />
        <TagGroup multi={false} label="Elasticity" options={["Strong — stretches and bounces back", "Weak — snaps or does not return"]} value={elasticity} onChange={setElasticity} />
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

        <HairLengthPicker
          inches={lengthInches}
          bucket={lengthBucket}
          onChange={({ inches, bucket }) => {
            setLengthInches(inches);
            setLengthBucket(bucket);
          }}
        />


        <Button variant="gold" size="pill" className="mt-4" onClick={async () => {
          const gaps: string[] = [];
          if (diameter.length === 0) gaps.push("strand diameter");
          if (texture.length === 0) gaps.push("surface texture");
          if (density.length === 0) gaps.push("density");
          if (porosity.length === 0) gaps.push("porosity");
          if (elasticity.length === 0) gaps.push("elasticity");
          if (scalp.length === 0) gaps.push("scalp condition");
          if (diagnosed.length === 0) gaps.push("diagnosed conditions");
          if (areas.length === 0) gaps.push("areas of concern");
          if (gaps.length > 0) {
            toast.error(`Please answer ${gaps[0]} — ${gaps.length} question${gaps.length === 1 ? "" : "s"} still to go.`);
            return;
          }
          localStorage.setItem("strand_hair_profile", JSON.stringify({
            diameter, texture, density, porosity, elasticity, scalp, diagnosed, areas,
            length_inches: lengthInches, length_bucket: lengthBucket,
          }));
          // Dual-write to user_hair_profile. PHASE_1_PLAN.md §15.
          try {
            const { data: u } = await supabase.auth.getUser();
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
                    diameter: diameter[0] ?? null,
                    surface_texture: texture[0] ?? null,
                    density: density[0] ?? null,
                    porosity: porosity[0] ?? null,
                    elasticity: elasticity[0] ?? null,
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
          // One-time optional ask, at the moment the hair profile is complete.
          if (shouldAsk) {
            setAskOffers(true);
            return;
          }
          goNext();
        }}>
          Continue →
        </Button>
        <PersonalisedOffersPrompt
          open={askOffers}
          onFinish={() => {
            setAskOffers(false);
            goNext();
          }}
        />
      </div>
    </ScreenLayout>
  );
};

export default ProfileStep3Hair;
