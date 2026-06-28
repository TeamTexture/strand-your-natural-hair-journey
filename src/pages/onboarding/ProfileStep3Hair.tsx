import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import Tag from "@/components/Tag";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { encryptForStorage } from "@/lib/clinicalContext";
import { toast } from "sonner";

interface TGProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
}
const TagGroup = ({ label, options, value, onChange, multi = true }: TGProps) => {
  const toggle = (opt: string) => {
    if (multi) {
      onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
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
  const [diameter, setDiameter] = useState(["Medium"]);
  const [texture, setTexture] = useState(["Rough / crinkly"]);
  const [density, setDensity] = useState(["High"]);
  const [porosity, setPorosity] = useState(["High — raised cuticle"]);
  const [elasticity, setElasticity] = useState(["Strong — stretches and bounces back"]);
  const [scalp, setScalp] = useState(["Dry"]);
  const [diagnosed, setDiagnosed] = useState(["Traction alopecia"]);
  const [areas, setAreas] = useState(["Edges / hairline"]);

  return (
    <ScreenLayout>
      <TitleBar title="Hair Characteristics" right={<span>5 of 9</span>} />
      <ProgressDots total={9} current={5} />
      <ItalicSub>Fill these in from your consultation notes. These are the real clinical markers — not curl typing.</ItalicSub>

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
          value={diagnosed} onChange={setDiagnosed}
        />
        <TagGroup
          label="Areas of Concern"
          options={["Edges / hairline", "Temples", "Crown", "Nape", "Overall thinning", "None"]}
          value={areas} onChange={setAreas}
        />

        <Button variant="gold" size="pill" className="mt-4" onClick={async () => {
          localStorage.setItem("strand_hair_profile", JSON.stringify({
            diameter, texture, density, porosity, elasticity, scalp, diagnosed, areas,
          }));
          // Dual-write to user_hair_profile. PHASE_1_PLAN.md §15.
          try {
            const { data: u } = await supabase.auth.getUser();
            if (u?.user) {
              const enc = await encryptForStorage([
                { id: "scalp", plaintext: scalp[0] ?? "" },
                { id: "diagnosed", plaintext: JSON.stringify(diagnosed) },
              ]);
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
                  },
                  { onConflict: "user_id" },
                );
              if (error) throw error;
            }
          } catch (err) {
            console.error("[strand] user_hair_profile upsert failed", err);
            toast.error("Could not save your hair profile. Check your connection.");
            return;
          }
          localStorage.setItem("strand_onboarding_step", "/onboarding/profile-step-4-colour");
          navigate("/onboarding/profile-step-4-colour");
        }}>
          Continue →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProfileStep3Hair;
