import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import Tag from "@/components/Tag";
import FormField from "@/components/FormField";
import { Button } from "@/components/ui/button";

interface TagGroupProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}
const TagGroup = ({ label, options, value, onChange }: TagGroupProps) => {
  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
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
  const [meds, setMeds] = useState("");

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

        <TagGroup label="Diet Type" options={["Omnivore", "Vegetarian", "Vegan", "Pescatarian", "Other"]} value={diet} onChange={setDiet} />
        <TagGroup label="Diet Balance" options={["Very varied", "Fairly balanced", "Limited / restricted"]} value={dietBalance} onChange={setDietBalance} />
        <TagGroup label="Do You Smoke" options={["No", "Occasionally", "Regularly", "Ex-smoker"]} value={smoke} onChange={setSmoke} />
        <TagGroup label="Alcohol" options={["None", "Light social", "Moderate", "Heavy"]} value={alcohol} onChange={setAlcohol} />
        <TagGroup label="Daily Water" options={["Under 1 litre", "1-2 litres", "2+ litres"]} value={water} onChange={setWater} />
        <TagGroup label="Exercise" options={["Rarely", "1-3x per week", "4-5x per week", "Daily"]} value={exercise} onChange={setExercise} />
        <TagGroup label="Sleep Quality" options={["Poor", "Average", "Good"]} value={sleep} onChange={setSleep} />

        <FormField label="Medications" value={meds} onChange={(e) => setMeds(e.target.value)} placeholder="Tap to add..." />

        <Button variant="gold" size="pill" className="mt-4" onClick={() => navigate("/onboarding/pro-gate")}>
          Continue →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProfileStep2;
