import { useMemo, useRef, useState } from "react";
import { useOnboardingDraft } from "@/hooks/useOnboardingDraft";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { onboardingBack } from "@/lib/onboardingFlow";
import ProgressDots from "@/components/ProgressDots";
import ItalicSub from "@/components/ItalicSub";
import Tag from "@/components/Tag";
import MedicationPicker from "@/components/MedicationPicker";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { encryptForStorage } from "@/lib/clinicalContext";
import { DIET_OPTIONS, canonDiet } from "@/lib/dietaryPattern";
import {
  LIFE_STAGE_OPTIONS,
  CONTRACEPTION_OPTIONS,
  CONDITIONS_OPTIONS,
  DIET_BALANCE_OPTIONS,
  SMOKE_OPTIONS,
  ALCOHOL_OPTIONS,
  WATER_OPTIONS,
  EXERCISE_OPTIONS,
  SLEEP_OPTIONS,
  toggleCondition,
} from "@/lib/healthOptions";

/* ── shared field shell ───────────────────────────────────────────────── */

interface FieldProps {
  id: string;
  label: string;
  answered: boolean;
  invalid: boolean;
  hint?: string;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}
const Field = ({ id, label, answered, invalid, hint, registerRef, children }: FieldProps) => (
  <div
    ref={(el) => registerRef(id, el)}
    className={cn(
      "rounded-[14px] transition-all scroll-mt-24",
      invalid && "ring-2 ring-destructive/70 bg-destructive/5 -mx-2 px-2 py-2",
    )}
  >
    <div className="flex items-baseline justify-between gap-2 mb-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
        {label}
      </div>
      {!answered && (
        <span
          className={cn(
            "text-[10px] uppercase tracking-[0.14em] font-body",
            invalid ? "text-destructive" : "text-muted-foreground/70",
          )}
        >
          Required
        </span>
      )}
    </div>
    {children}
    {hint && <p className="mt-1.5 text-[12px] italic text-muted-foreground leading-snug">{hint}</p>}
  </div>
);

interface ChipFieldProps extends Omit<FieldProps, "children" | "answered" | "invalid"> {
  options: readonly string[];
  value: string[];
  onToggle: (opt: string) => void;
  invalid: boolean;
}
const ChipField = ({ options, value, onToggle, ...rest }: ChipFieldProps) => (
  <Field {...rest} answered={value.length > 0}>
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Tag key={o} selected={value.includes(o)} onClick={() => onToggle(o)} className="min-h-[38px]">
          {o}
        </Tag>
      ))}
    </div>
  </Field>
);

/** One option per row, 46px tap height, unfilled radio circle when unselected. */
interface RadioFieldProps extends Omit<FieldProps, "children" | "answered" | "invalid"> {
  options: readonly string[];
  value: string | null;
  onSelect: (opt: string) => void;
  invalid: boolean;
}
const RadioField = ({ options, value, onSelect, ...rest }: RadioFieldProps) => (
  <Field {...rest} answered={!!value}>
    <div className="space-y-2">
      {options.map((o) => {
        const selected = value === o;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(o)}
            className={cn(
              "w-full min-h-[46px] flex items-center gap-3 px-3.5 rounded-[12px] border bg-card text-left transition-colors",
              selected ? "border-primary border-2" : "border-border",
            )}
          >
            <span
              className={cn(
                "size-[18px] rounded-full border-2 shrink-0 flex items-center justify-center",
                selected ? "border-primary" : "border-border",
              )}
            >
              {selected && <span className="size-[9px] rounded-full bg-primary" />}
            </span>
            <span className="text-[14px] font-body text-foreground">{o}</span>
          </button>
        );
      })}
    </div>
  </Field>
);

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-[19px] leading-tight text-foreground pt-2">{children}</h2>
);

/* ── screen ───────────────────────────────────────────────────────────── */

const ProfileStep2 = () => {
  const navigate = useNavigate();
  // No defaults. Every answer must be given by the member — we never assert a
  // life stage, a condition-free history or a lifestyle on anyone's behalf.
  const [lifeStage, setLifeStage] = useState<string[]>([]);
  const [contraception, setContraception] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [diet, setDiet] = useState<string | null>(null);
  const [dietBalance, setDietBalance] = useState<string | null>(null);
  const [smoke, setSmoke] = useState<string | null>(null);
  const [alcohol, setAlcohol] = useState<string | null>(null);
  const [water, setWater] = useState<string | null>(null);
  const [exercise, setExercise] = useState<string | null>(null);
  const [sleep, setSleep] = useState<string | null>(null);
  const [dietOther, setDietOther] = useState("");
  const [meds, setMeds] = useState<{ name: string; category: string }[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const registerRef = (id: string, el: HTMLDivElement | null) => {
    refs.current[id] = el;
  };

  // Keep everything typed on this step if the member navigates back and forth.
  useOnboardingDraft(
    "profile-step-2",
    { lifeStage, contraception, conditions, diet, dietOther, dietBalance, smoke, alcohol, water, exercise, sleep, meds },
    (d) => {
      if (Array.isArray(d.lifeStage)) setLifeStage(d.lifeStage.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.contraception)) setContraception(d.contraception.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.conditions)) setConditions(d.conditions.filter((v): v is string => typeof v === "string"));
      if (typeof d.diet === "string") setDiet(d.diet);
      if (d.dietOther) setDietOther(d.dietOther);
      if (typeof d.dietBalance === "string") setDietBalance(d.dietBalance);
      if (typeof d.smoke === "string") setSmoke(d.smoke);
      if (typeof d.alcohol === "string") setAlcohol(d.alcohol);
      if (typeof d.water === "string") setWater(d.water);
      if (typeof d.exercise === "string") setExercise(d.exercise);
      if (typeof d.sleep === "string") setSleep(d.sleep);
      if (Array.isArray(d.meds)) {
        setMeds(d.meds.filter(
          (m): m is { name: string; category: string } =>
            !!m && typeof m === "object" && typeof m.name === "string" && typeof m.category === "string",
        ));
      }
    },
  );

  const missing = useMemo(() => {
    const m: { id: string; label: string }[] = [];
    if (lifeStage.length === 0) m.push({ id: "lifeStage", label: "Life stage" });
    if (contraception.length === 0) m.push({ id: "contraception", label: "Contraception" });
    if (conditions.length === 0) m.push({ id: "conditions", label: "Medical conditions" });
    if (!diet) m.push({ id: "diet", label: "Diet type" });
    if (!dietBalance) m.push({ id: "dietBalance", label: "Diet balance" });
    if (!smoke) m.push({ id: "smoke", label: "Smoking" });
    if (!alcohol) m.push({ id: "alcohol", label: "Alcohol" });
    if (!water) m.push({ id: "water", label: "Daily water" });
    if (!exercise) m.push({ id: "exercise", label: "Exercise" });
    if (!sleep) m.push({ id: "sleep", label: "Sleep quality" });
    return m;
  }, [lifeStage, contraception, conditions, diet, dietBalance, smoke, alcohol, water, exercise, sleep]);

  const invalid = (id: string) => showErrors && missing.some((m) => m.id === id);

  const toggleMulti = (
    value: string[],
    setValue: (n: string[]) => void,
  ) => (opt: string) =>
    setValue(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);

  const onContinue = async () => {
    if (missing.length > 0) {
      setShowErrors(true);
      const first = refs.current[missing[0].id];
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast.error(`Please answer ${missing[0].label.toLowerCase()} — ${missing.length} question${missing.length === 1 ? "" : "s"} still to go.`);
      return;
    }

    setSaving(true);
    const dietCanon = canonDiet(diet);
    const alcoholRaw = (alcohol ?? "").toLowerCase();
    const alcoholCanon =
      alcoholRaw === "none" ? "none" :
      alcoholRaw.includes("light") ? "light" :
      alcoholRaw.includes("moderate") ? "moderate" :
      alcoholRaw.includes("heavy") ? "heavy" : "unknown";
    localStorage.setItem("strand_health_profile", JSON.stringify({
      lifeStage, contraception, conditions, diet: dietCanon, dietOther, dietBalance,
      smoke, alcohol: alcoholCanon, water, exercise, sleep,
      medications: meds.map((m) => m.name),
    }));
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
              diet_other: dietCanon === "other" ? (dietOther.trim() || null) : null,
              diet_balance: dietBalance,
              smoke,
              alcohol: alcoholCanon,
              daily_water: water,
              exercise,
              sleep_quality: sleep,
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
      setSaving(false);
      return;
    }
    localStorage.setItem("strand_onboarding_step", "/onboarding/pro-gate");
    navigate("/onboarding/pro-gate");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Health Profile" onBack={onboardingBack(navigate, "/onboarding/profile-step-2")} right={<span>2 of 9</span>} />
      <ProgressDots total={9} current={2} />
      <ItalicSub>
        Hormones and health conditions are the biggest drivers of hair behaviour. All data is private.
      </ItalicSub>

      <div className="px-5 space-y-5 pb-8">
        <p className="text-[13px] font-body text-muted-foreground leading-snug">
          Every question here needs your own answer — we never assume one for you.
        </p>

        <SectionHeading>Hormones and health</SectionHeading>
        <ChipField
          id="lifeStage"
          label="Life Stage"
          hint="Select all that apply, or “None currently”."
          options={LIFE_STAGE_OPTIONS}
          value={lifeStage}
          onToggle={toggleMulti(lifeStage, setLifeStage)}
          invalid={invalid("lifeStage")}
          registerRef={registerRef}
        />
        <ChipField
          id="contraception"
          label="Contraception"
          options={CONTRACEPTION_OPTIONS}
          value={contraception}
          onToggle={toggleMulti(contraception, setContraception)}
          invalid={invalid("contraception")}
          registerRef={registerRef}
        />
        <ChipField
          id="conditions"
          label="Medical Conditions"
          hint="Tap “None” if nothing applies — we will not assume it."
          options={CONDITIONS_OPTIONS}
          value={conditions}
          onToggle={(opt) => setConditions(toggleCondition(conditions, opt))}
          invalid={invalid("conditions")}
          registerRef={registerRef}
        />

        <div className="border-t border-border my-2" />

        <SectionHeading>Diet</SectionHeading>
        <RadioField
          id="diet"
          label="Diet Type"
          options={DIET_OPTIONS}
          value={diet}
          onSelect={setDiet}
          invalid={invalid("diet")}
          registerRef={registerRef}
        />
        {canonDiet(diet) === "other" && (
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
              What You Avoid
            </div>
            <input
              type="text"
              value={dietOther}
              maxLength={200}
              onChange={(e) => setDietOther(e.target.value)}
              placeholder="e.g. no dairy, no pork"
              className="w-full min-h-[46px] rounded-[12px] border border-border bg-card px-3.5 py-2.5 text-[15px] font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            <p className="mt-1.5 text-[12px] italic text-muted-foreground leading-snug">
              Optional. Until you tell us, we keep every food suggestion plant-based rather than guess.
            </p>
          </div>
        )}
        <RadioField
          id="dietBalance"
          label="Diet Balance"
          options={DIET_BALANCE_OPTIONS}
          value={dietBalance}
          onSelect={setDietBalance}
          invalid={invalid("dietBalance")}
          registerRef={registerRef}
        />

        <div className="border-t border-border my-2" />

        <SectionHeading>Lifestyle</SectionHeading>
        <ChipField
          id="smoke"
          label="Do You Smoke"
          options={SMOKE_OPTIONS}
          value={smoke ? [smoke] : []}
          onToggle={(o) => setSmoke(smoke === o ? null : o)}
          invalid={invalid("smoke")}
          registerRef={registerRef}
        />
        <ChipField
          id="alcohol"
          label="Alcohol"
          options={ALCOHOL_OPTIONS}
          value={alcohol ? [alcohol] : []}
          onToggle={(o) => setAlcohol(alcohol === o ? null : o)}
          invalid={invalid("alcohol")}
          registerRef={registerRef}
        />
        <ChipField
          id="water"
          label="Daily Water"
          options={WATER_OPTIONS}
          value={water ? [water] : []}
          onToggle={(o) => setWater(water === o ? null : o)}
          invalid={invalid("water")}
          registerRef={registerRef}
        />
        <ChipField
          id="exercise"
          label="Exercise"
          options={EXERCISE_OPTIONS}
          value={exercise ? [exercise] : []}
          onToggle={(o) => setExercise(exercise === o ? null : o)}
          invalid={invalid("exercise")}
          registerRef={registerRef}
        />
        <ChipField
          id="sleep"
          label="Sleep Quality"
          options={SLEEP_OPTIONS}
          value={sleep ? [sleep] : []}
          onToggle={(o) => setSleep(sleep === o ? null : o)}
          invalid={invalid("sleep")}
          registerRef={registerRef}
        />

        <div className="border-t border-border my-2" />

        <MedicationPicker value={meds} onChange={setMeds} />

        {missing.length > 0 && (
          <div className="rounded-[14px] border border-border bg-card px-4 py-3">
            <p className="text-[12px] font-body text-foreground">
              {missing.length} question{missing.length === 1 ? "" : "s"} still to answer:
            </p>
            <p className="mt-1 text-[12px] font-body text-muted-foreground leading-snug">
              {missing.map((m) => m.label).join(" · ")}
            </p>
          </div>
        )}

        <Button variant="gold" size="pill" className="mt-4" disabled={saving} onClick={onContinue}>
          {saving ? "Saving…" : "Continue →"}
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProfileStep2;
