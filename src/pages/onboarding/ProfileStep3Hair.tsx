import { useState } from "react";
import { toggleWithNone } from "@/lib/healthOptions";
import { useOnboardingDraft } from "@/hooks/useOnboardingDraft";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { onboardingBack } from "@/lib/onboardingFlow";
import OnboardingGuide from "@/components/onboarding/OnboardingGuide";
import ItalicSub from "@/components/ItalicSub";
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
  const safeValue = Array.isArray(value) ? value : [];
  const toggle = (opt: string) => {
    if (multi) {
      onChange(noneLabel ? toggleWithNone(safeValue, opt, noneLabel) : safeValue.includes(opt) ? safeValue.filter((v) => v !== opt) : [...safeValue, opt]);
    } else {
      onChange([opt]);
    }
  };
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Tag key={o} selected={safeValue.includes(o)} onClick={() => toggle(o)}>
            {o}
          </Tag>
        ))}
      </div>
    </div>
  );
};

const ProfileStep3Hair = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // No defaults — a pre-selected answer would be an assumption about her hair
  // and scalp that she never made, so every group starts genuinely empty.
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
    { porosity, elasticity, scalp, diagnosed, areas, lengthInches, lengthBucket },
    (d) => {
      // Older saved drafts used different shapes. Only restore values the
      // current controls can render; malformed arrays previously crashed on
      // `.includes()` immediately after a refresh.
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

  const goNext = async () => {
    localStorage.setItem("strand_onboarding_step", "/onboarding/profile-step-4-colour");
    const { data } = await supabase.auth.getUser();
    await queryClient.invalidateQueries({ queryKey: ["consumer_onboarding_route", data.user?.id] });
    navigate("/onboarding/profile-step-4-colour");
  };


  return (
    <ScreenLayout>
      <TitleBar title="Hair Characteristics" onBack={onboardingBack(navigate, "/onboarding/profile-step-3-hair")} />
      <OnboardingGuide className="pt-2 pb-1" />
      <ItalicSub>Answer these from what you know about your own hair. You can refine them later with a professional.</ItalicSub>

      <div className="px-5 pb-8 space-y-5">
        <TagGroup
          multi={false}
          label="How your hair takes water"
          options={["Soaks it up fast", "Water beads and sits on top", "Somewhere in between"]}
          value={porosity} onChange={setPorosity}
        />
        <TagGroup
          multi={false}
          label="How a wet strand behaves when you stretch it"
          options={["Stretches and springs back", "Snaps, or stays stretched", "Not sure"]}
          value={elasticity} onChange={setElasticity}
        />
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
          if (porosity.length === 0) gaps.push("how your hair takes water");
          if (elasticity.length === 0) gaps.push("how a wet strand behaves");
          if (scalp.length === 0) gaps.push("scalp condition");
          if (diagnosed.length === 0) gaps.push("diagnosed conditions");
          if (areas.length === 0) gaps.push("areas of concern");
          if (gaps.length > 0) {
            toast.error(`Please answer ${gaps[0]} — ${gaps.length} question${gaps.length === 1 ? "" : "s"} still to go.`);
            return;
          }
          localStorage.setItem("strand_hair_profile", JSON.stringify({
            porosity, elasticity, scalp, diagnosed, areas,
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
           void goNext();
        }}>
          Continue →
        </Button>
        <PersonalisedOffersPrompt
          open={askOffers}
          onFinish={() => {
            setAskOffers(false);
             void goNext();
          }}
        />
      </div>
    </ScreenLayout>
  );
};

export default ProfileStep3Hair;
