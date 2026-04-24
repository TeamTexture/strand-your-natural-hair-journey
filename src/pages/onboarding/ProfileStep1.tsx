import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import FormField from "@/components/FormField";
import { Button } from "@/components/ui/button";

const ProfileStep1 = () => {
  const navigate = useNavigate();
  const [v, setV] = useState({
    name: "Paige Lewin",
    age: "35",
    postcode: "SW6 3BX",
    country: "United Kingdom",
    ethnicity: "Black British — Jamaican heritage",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: e.target.value });

  return (
    <ScreenLayout>
      <TitleBar title="About You" right={<span>1 of 9</span>} />
      <ProgressDots total={9} current={1} />
      <ItalicSub>This shapes every recommendation Strand makes.</ItalicSub>

      <div className="px-5 space-y-4 pb-8">
        <FormField label="Full Name" value={v.name} onChange={set("name")} />
        <FormField label="Age" value={v.age} onChange={set("age")} inputMode="numeric" />
        <FormField
          label="Postcode"
          value={v.postcode}
          onChange={set("postcode")}
          showTick={false}
          rightAdornment={
            <span className="bg-primary/15 text-primary text-[10px] uppercase tracking-[0.15em] font-medium px-2 py-1 rounded">
              Hard water ⚠
            </span>
          }
        />
        <FormField label="Country of Residence" value={v.country} onChange={set("country")} />
        <FormField
          label="Ethnicity / Heritage (voluntary)"
          value={v.ethnicity}
          onChange={set("ethnicity")}
        />

        <Button
          variant="gold"
          size="pill"
          className="mt-4"
          onClick={() => navigate("/onboarding/profile-step-2")}
        >
          Continue →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProfileStep1;
