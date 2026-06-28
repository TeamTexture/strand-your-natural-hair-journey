import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import Tag from "@/components/Tag";
import MedicationPicker from "@/components/MedicationPicker";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { encryptForStorage } from "@/lib/clinicalContext";

interface TagGroupProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  single?: boolean;
}
const TagGroup = ({ label, options, value, onChange, single }: TagGroupProps) => {
  const toggle = (opt: string) => {
    if (single) {
      onChange(value.includes(opt) ? [] : [opt]);
    } else {
      onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
    }
  };
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
        {label}
      </div>
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

const ProfileStep2 = () => {
  const navigate = useNavigate();
  const [lifeStage, setLifeStage] = useState<string[]>(["None currently"]);
  const [contraception, setContraception] = useState<string[]>(["None non-hormonal"]);
  const [conditions, setConditions] = useState<string[]>(["None"]);
  const [diet, setDiet] = useState<string[]>(["Omnivore"]);
  const [dietBalance, setDietBalance] = useState<string[]>(["Fairly balanced"]);
  const [smoke, setSmoke] = useState<string[]>(["No"]);
  const [alcohol, setAlcohol] = useState<string[]>(["Light social"]);
  const [water, setWater] = useState<string[]>(["1-2 litres"]);
  const [exercise, setExercise] = useState<string[]>(["1-3x per week"]);
  const [sleep, setSleep] = useState<string[]>(["Average"]);
  const [meds, setMeds] = useState<{ name: string; category: string }[]>([]);

  return (
    <ScreenLayout>
      <TitleBar title="Health Profile" right={<span>2 of 9</span>} />
      <ProgressDots total={9} current={2} />
      <ItalicSub>
        Hormones and health conditions are the biggest drivers of hair behaviour. All data is private.
      </ItalicSub>

      <div className="px-5 space-y-5 pb-8">
        <TagGroup
          label="Life Stage"
          options={["Pregnant", "Postpartum", "Perimenopause", "Menopause", "None currently"]}
          value={lifeStage}
          onChange={setLifeStage}
        />
        <TagGroup
          label="Contraception"
          options={["Hormonal pill", "IUD hormonal", "Implant", "HRT", "Fertility treatment", "None non-hormonal"]}
          value={contraception}
          onChange={setContraception}
        />
        <TagGroup
          label="Medical Conditions"
          options={[
            "Thyroid condition", "PCOS", "Anaemia", "Diabetes", "Lupus", "Coeliac", "Psoriasis",
            "Eczema", "Chronic stress / anxiety", "Eating disorder", "Alopecia", "Cancer / chemo", "None",
          ]}
          value={conditions}
          onChange={setConditions}
        />

        <div className="border-t border-border my-2" />

        <TagGroup single label="Diet Type" options={["Omnivore", "Vegetarian", "Vegan", "Pescatarian", "Other"]} value={diet} onChange={setDiet} />
        <TagGroup single label="Diet Balance" options={["Very varied", "Fairly balanced", "Limited / restricted"]} value={dietBalance} onChange={setDietBalance} />
        <TagGroup single label="Do You Smoke" options={["No", "Occasionally", "Regularly", "Ex-smoker"]} value={smoke} onChange={setSmoke} />
        <TagGroup single label="Alcohol" options={["None", "Light social", "Moderate", "Heavy"]} value={alcohol} onChange={setAlcohol} />
        <TagGroup single label="Daily Water" options={["Under 1 litre", "1-2 litres", "2+ litres"]} value={water} onChange={setWater} />
        <TagGroup single label="Exercise" options={["Rarely", "1-3x per week", "4-5x per week", "Daily"]} value={exercise} onChange={setExercise} />
        <TagGroup single label="Sleep Quality" options={["Poor", "Average", "Good"]} value={sleep} onChange={setSleep} />

        <MedicationPicker value={meds} onChange={setMeds} />

        <Button variant="gold" size="pill" className="mt-4" onClick={async () => {
          const dietRaw = (diet[0] || "").toLowerCase();
          const dietCanon =
            dietRaw === "vegan" ? "vegan" :
            dietRaw === "vegetarian" ? "vegetarian" :
            dietRaw ? "omnivore" : "unknown";
          const alcoholRaw = (alcohol[0] || "").toLowerCase();
          const alcoholCanon =
            alcoholRaw === "none" ? "none" :
            alcoholRaw.includes("light") ? "light" :
            alcoholRaw.includes("moderate") ? "moderate" :
            alcoholRaw.includes("heavy") ? "heavy" : "unknown";
          localStorage.setItem("strand_health_profile", JSON.stringify({
            lifeStage, contraception, conditions, diet: dietCanon, dietBalance,
            smoke, alcohol: alcoholCanon, water, exercise, sleep,
            medications: meds.map((m) => m.name),
          }));
          // Persist to DB. PHASE_1_PLAN.md §15.
          try {
            const { data: u } = await supabase.auth.getUser();
            if (u?.user) {
              const userId = u.user.id;

              // ── user_health_profile (encrypt life_stage / contraception / conditions) ──
              const enc = await encryptForStorage([
                { id: "life_stage", plaintext: JSON.stringify(lifeStage) },
                { id: "contraception", plaintext: JSON.stringify(contraception) },
                { id: "medical_conditions", plaintext: JSON.stringify(conditions) },
              ]);
              const { error: healthErr } = await supabase
                .from("user_health_profile")
                .upsert(
                  {
                    user_id: userId,
                    life_stage_enc: enc.life_stage,
                    contraception_enc: enc.contraception,
                    medical_conditions_enc: enc.medical_conditions,
                    diet: dietCanon,
                    diet_balance: dietBalance[0] ?? null,
                    smoke: smoke[0] ?? null,
                    alcohol: alcoholCanon,
                    daily_water: water[0] ?? null,
                    exercise: exercise[0] ?? null,
                    sleep_quality: sleep[0] ?? null,
                  },
                  { onConflict: "user_id" },
                );
              if (healthErr) throw healthErr;

              // ── user_medications (replace + dual-write encrypted name/category) ──
              await supabase.from("user_medications").delete().eq("user_id", userId);
              if (meds.length > 0) {
                const capped = meds.slice(0, 20);
                const items = capped.flatMap((m, i) => [
                  { id: `${i}_name`, plaintext: m.name },
                  { id: `${i}_category`, plaintext: m.category ?? "" },
                ]);
                const medsEnc = await encryptForStorage(items);
                const { error: medsErr } = await supabase
                  .from("user_medications")
                  .insert(
                    capped.map((m, i) => ({
                      user_id: userId,
                      name: m.name,
                      category: m.category,
                      name_enc: medsEnc[`${i}_name`],
                      category_enc: medsEnc[`${i}_category`],
                    })),
                  );
                if (medsErr) throw medsErr;
              }
            }
          } catch (e) {
            console.error("[strand] health profile / meds save failed", e);
            toast.error("Could not save your health profile. Check your connection.");
            return;
          }
          localStorage.setItem("strand_onboarding_step", "/onboarding/pro-gate");
          navigate("/onboarding/pro-gate");
        }}>
          Continue →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProfileStep2;
