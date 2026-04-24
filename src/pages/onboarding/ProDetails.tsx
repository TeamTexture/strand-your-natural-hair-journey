import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Shield, AlertCircle, Loader2, Check, CalendarX } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import FormField from "@/components/FormField";
import Tag from "@/components/Tag";
import ProAvatar from "@/components/ProAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { searchProfessionalsIn, type Professional } from "@/data/professionals";
import { useDirectoryProfessionals } from "@/hooks/useDirectoryProfessionals";

const types = ["Trichologist", "Dermatologist", "Curl Specialist", "GP"];

type ValidState = "neutral" | "loading" | "valid" | "error";

interface ValidationResult {
  state: ValidState;
  message?: string;
}

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
  // PRODUCTION: call GMC public Doctor Search API to verify the registrant.
  // https://www.gmc-uk.org/registration-and-licensing/the-medical-register
  return { state: "valid", message: "GMC number format confirmed" };
};

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
  /** Hint shown when the value was auto-filled from the directory. */
  autoFilledFrom?: string;
}

const ValidatedField = ({
  label,
  placeholder,
  value,
  onChange,
  validator,
  autoFilledFrom,
}: VFieldProps) => {
  const [debounced, setDebounced] = useState<ValidationResult>({ state: "neutral" });

  useEffect(() => {
    const next = validator(value);
    if (next.state !== "valid") {
      setDebounced(next);
      return;
    }
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

      {autoFilledFrom && debounced.state === "valid" && (
        <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-primary font-body bg-primary/10 px-2 py-1 rounded">
          <Check className="size-3" />
          Auto-filled from {autoFilledFrom}
        </div>
      )}
      {!autoFilledFrom && debounced.state === "loading" && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground font-body">
          <Loader2 className="size-3 animate-spin" />
          Checking format…
        </div>
      )}
      {!autoFilledFrom && debounced.state === "valid" && (
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
  const { pros } = useDirectoryProfessionals();

  const [query, setQuery] = useState("");
  const [pickedFrom, setPickedFrom] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("Dermatologist");
  const [gmc, setGmc] = useState("");
  const [iot, setIot] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  const showIot = type === "Trichologist";

  const matches = useMemo(() => {
    const q = query.trim();
    if (q.length < 2 || pickedFrom) return [];
    return searchProfessionalsIn(pros, q).slice(0, 5);
  }, [pros, query, pickedFrom]);

  /** Apply a directory pick into the manual form. */
  const applyPro = (p: Professional) => {
    setName(p.name);
    setType(p.type);
    if (p.gmcNumber) setGmc(p.gmcNumber);
    if (p.iotNumber) setIot(p.iotNumber);
    setQuery(p.name);
    setPickedFrom(p.clinic ?? p.name);
  };

  const clearPick = () => {
    setPickedFrom(null);
    setQuery("");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Your Professional" right={<span>4 of 9</span>} />
      <ProgressDots total={9} current={4} />
      <ItalicSub>Search our directory or add manually. We verify against the official register.</ItalicSub>

      <div className="px-5 pb-8 space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (pickedFrom) setPickedFrom(null);
            }}
            placeholder="Name, clinic, or postcode..."
            autoComplete="off"
            className="w-full pl-10 pr-3.5 py-3 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60"
          />

          {matches.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-[10px] shadow-lg overflow-hidden max-h-[280px] overflow-y-auto">
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPro(p)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-primary/5 border-b border-border/50 last:border-b-0 min-h-[56px]"
                >
                  <ProAvatar name={p.name} photoUrl={p.photoUrl} size="size-9" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {p.clinic} · {p.location}
                    </p>
                  </div>
                  {(p.gmcNumber || p.iotNumber) && (
                    <span className="text-[10px] uppercase tracking-[0.1em] text-good bg-good/10 px-1.5 py-0.5 rounded shrink-0">
                      Verified
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {pickedFrom && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/30 rounded-[10px]">
            <Check className="size-4 text-primary shrink-0" />
            <p className="text-xs text-foreground flex-1 min-w-0 truncate">
              Details auto-filled from <span className="font-medium">{pickedFrom}</span>
            </p>
            <button
              type="button"
              onClick={clearPick}
              className="text-[11px] uppercase tracking-[0.1em] text-primary font-medium px-2 min-h-[36px]"
            >
              Clear
            </button>
          </div>
        )}

        {/* Visual separator between directory search and manual entry */}
        <div className="pt-4 pb-1">
          <div className="relative h-[2px] bg-border rounded-full">
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
              or
            </span>
          </div>
          <div className="flex justify-center mt-3">
            <span className="bg-primary/15 border border-primary/30 text-primary text-[10px] uppercase tracking-[0.2em] font-medium px-3 py-1.5 rounded-full">
              Add details manually
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground text-center mt-3 font-body leading-relaxed px-4">
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
          onChange={(v) => {
            setGmc(v);
            if (pickedFrom) setPickedFrom(null);
          }}
          validator={validateGmc}
          autoFilledFrom={pickedFrom && gmc ? pickedFrom : undefined}
        />

        {showIot && (
          <ValidatedField
            label="IOT Membership Number"
            placeholder="Enter IOT membership number"
            value={iot}
            onChange={(v) => {
              setIot(v);
              if (pickedFrom) setPickedFrom(null);
            }}
            validator={validateIot}
            autoFilledFrom={pickedFrom && iot ? pickedFrom : undefined}
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
          Continue →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProDetails;
