import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Shield, AlertCircle, Loader2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import FormField from "@/components/FormField";
import Tag from "@/components/Tag";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const types = ["Trichologist", "Dermatologist", "Curl Specialist", "GP"];

type ValidState = "neutral" | "loading" | "valid" | "error";

interface ValidationResult {
  state: ValidState;
  message?: string;
}

/** Validate a GMC number (UK General Medical Council — 7 digits exactly). */
const validateGmc = (raw: string): ValidationResult => {
  const v = raw.trim();
  if (v.length === 0) return { state: "neutral" };
  if (/[^0-9]/.test(v)) {
    return { state: "error", message: "GMC numbers contain digits only" };
  }
  if (v.length < 7) return { state: "neutral" };
  if (v.length > 7) {
    return { state: "error", message: "GMC numbers are 7 digits only" };
  }
  // Exactly 7 digits — format is valid.
  // PRODUCTION: call GMC public Doctor Search API to verify the registrant is
  // licensed to practise. https://www.gmc-uk.org/registration-and-licensing/the-medical-register
  return { state: "valid", message: "GMC number format confirmed" };
};

/** Validate an IOT (Institute of Trichologists) membership number — 4-6 digits. */
const validateIot = (raw: string): ValidationResult => {
  const v = raw.trim();
  if (v.length === 0) return { state: "neutral" };
  if (/[^0-9]/.test(v)) {
    return { state: "error", message: "IOT numbers contain digits only" };
  }
  if (v.length < 4) return { state: "neutral" };
  if (v.length > 6) {
    return { state: "error", message: "IOT numbers are 4-6 digits" };
  }
  return { state: "valid", message: "IOT number format confirmed" };
};

interface VFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  validator: (v: string) => ValidationResult;
}

/** Form field with debounced loading state then live valid/error result. */
const ValidatedField = ({ label, placeholder, value, onChange, validator }: VFieldProps) => {
  const [debounced, setDebounced] = useState<ValidationResult>({ state: "neutral" });

  useEffect(() => {
    const next = validator(value);
    if (next.state !== "valid") {
      setDebounced(next);
      return;
    }
    // Show loading for 500ms before confirming valid.
    setDebounced({ state: "loading" });
    const t = window.setTimeout(() => setDebounced(next), 500);
    return () => window.clearTimeout(t);
  }, [value, validator]);

  const errored = debounced.state === "error";

  return (
    <div>
      <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="numeric"
        autoComplete="off"
        className={cn(
          "w-full px-3.5 py-3 bg-card rounded-[10px] border text-sm font-body",
          "placeholder:text-muted-foreground/60 focus:outline-none transition-colors",
          errored ? "border-warn" : "border-border focus:border-primary/60",
        )}
      />

      {debounced.state === "loading" && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground font-body">
          <Loader2 className="size-3 animate-spin" />
          Checking format…
        </div>
      )}
      {debounced.state === "valid" && (
        <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-good font-body bg-good/10 px-2 py-1 rounded">
          <Shield className="size-3" />
          {debounced.message}
        </div>
      )}
      {debounced.state === "error" && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-warn font-body">
          <AlertCircle className="size-3" />
          {debounced.message}
        </div>
      )}
    </div>
  );
};

const ProDetails = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState("Dermatologist");
  const [gmc, setGmc] = useState("");
  const [iot, setIot] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  const showIot = type === "Trichologist";

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
            autoComplete="off"
            className="w-full pl-10 pr-3.5 py-3 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60"
          />
        </div>

        {/* Visual separator between directory search and manual entry */}
        <div className="pt-4 pb-1">
          <div className="h-[2px] bg-border rounded-full" />
          <div className="flex justify-center -mt-3">
            <span className="bg-primary/15 border border-primary/30 text-primary text-[10px] uppercase tracking-[0.2em] font-medium px-3 py-1.5 rounded-full">
              Or add your own professional manually
            </span>
          </div>
          <p className="italic text-[11px] text-muted-foreground text-center mt-3 font-body leading-relaxed">
            Use this if your professional is not yet in our directory. We will verify their
            registration and add them for others to find.
          </p>
        </div>

        <FormField
          label="Professional's Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dr. Adaeze Okafor"
          autoComplete="off"
        />

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

        <ValidatedField
          label="GMC Number"
          placeholder="Enter GMC number (7 digits)"
          value={gmc}
          onChange={setGmc}
          validator={validateGmc}
        />

        {showIot && (
          <ValidatedField
            label="IOT Membership Number"
            placeholder="Enter IOT membership number"
            value={iot}
            onChange={setIot}
            validator={validateIot}
          />
        )}

        <FormField
          label="Date of Consultation"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          placeholder="10 March 2026"
          autoComplete="off"
        />

        <label className="block">
          <span className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
            Professional's Notes
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any treatment plan or recommendations given..."
            rows={4}
            autoComplete="off"
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
