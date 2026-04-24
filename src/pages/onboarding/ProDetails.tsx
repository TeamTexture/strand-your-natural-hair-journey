import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Shield } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import FormField from "@/components/FormField";
import Tag from "@/components/Tag";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";

const types = ["Trichologist", "Dermatologist", "Curl Specialist", "GP"];

const ProDetails = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("Dr. Adaeze Okafor");
  const [type, setType] = useState("Dermatologist");
  const [reg, setReg] = useState("GMC 7842931");
  const [date, setDate] = useState("10 March 2026");
  const [notes, setNotes] = useState("");

  return (
    <ScreenLayout>
      <TitleBar title="Your Professional" right={<span>4 of 9</span>} />
      <ProgressDots total={9} current={4} />
      <ItalicSub>Search our directory or add manually. We verify against the official register.</ItalicSub>

      <div className="px-5 pb-8 space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            placeholder="Name, clinic, or postcode..."
            className="w-full pl-10 pr-3.5 py-3 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60"
          />
        </div>

        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">or add manually</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <FormField label="Professional's Name" value={name} onChange={(e) => setName(e.target.value)} />

        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
            Type
          </div>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <Tag key={t} selected={type === t} onClick={() => setType(t)}>
                {t}
              </Tag>
            ))}
          </div>
        </div>

        <FormField label="GMC / IOT Number or Website" value={reg} onChange={(e) => setReg(e.target.value)} />

        <SurfaceCard tone="green" className="flex items-center gap-3">
          <Shield className="size-5 text-good shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold font-body text-sm">{name}</p>
            <p className="text-xs text-good">✓ Verified — GMC Register · Licensed to practise</p>
          </div>
        </SurfaceCard>

        <FormField label="Date of Consultation" value={date} onChange={(e) => setDate(e.target.value)} />

        <label className="block">
          <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
            Professional's Notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any treatment plan or recommendations given..."
            rows={4}
            className="w-full px-3.5 py-3 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60 resize-none"
          />
        </label>

        <Button variant="gold" size="pill" className="mt-4" onClick={() => navigate("/onboarding/profile-step-3-hair")}>
          Continue to Hair Characteristics →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProDetails;
