import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import Tag from "@/components/Tag";
import FormField from "@/components/FormField";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import { Button } from "@/components/ui/button";

const HAIRSTYLE_OPTIONS = [
  "Loose natural",
  "Box braids",
  "Faux locs",
  "Cornrows",
  "Locs",
  "Wig unit",
  "Weave",
  "Relaxed",
  "Curly perm",
  "Silk press",
  "Wash and go",
  "Twist-out",
  "Finger comb coils",
  "Not sure yet",
];

interface TGProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (n: string[]) => void;
  multi?: boolean;
}
const TagGroup = ({ label, options, value, onChange, multi = true }: TGProps) => (
  <div>
    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">{label}</div>
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Tag
          key={o}
          selected={value.includes(o)}
          onClick={() =>
            multi
              ? onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o])
              : onChange([o])
          }
        >
          {o}
        </Tag>
      ))}
    </div>
  </div>
);

const ProfileStep4Colour = () => {
  const navigate = useNavigate();
  const [colour, setColour] = useState(["Natural"]);
  const [chemHist, setChemHist] = useState(["None"]);
  const [style, setStyle] = useState(["Box braids"]);
  const [howLong, setHowLong] = useState("9 days");
  const [plans, setPlans] = useState(["Yes — in 5 weeks"]);
  const [changingTo, setChangingTo] = useState<string[]>(["Loose natural"]);
  const [defaultStyle, setDefaultStyle] = useState<string[]>([
    "Box braids",
    "Loose natural",
  ]);

  const isChanging = plans.includes("Yes — in 5 weeks");

  return (
    <ScreenLayout>
      <TitleBar title="Colour & Style" right={<span>6 of 9</span>} />
      <ProgressDots total={9} current={6} />

      <div className="px-5 pb-8 space-y-5">
        <TagGroup
          label="Current Colour Status"
          options={["Natural", "Permanently dyed", "Bleached", "Demi-permanent", "Semi-permanent", "Henna ⚠"]}
          value={colour} onChange={setColour}
        />
        <TagGroup
          label="Chemical History"
          options={["Relaxer current", "Relaxer past", "Texturiser", "Curly perm", "Heat damage", "None"]}
          value={chemHist} onChange={setChemHist}
        />

        <div className="border-t border-border" />

        <TagGroup
          label="Current Hairstyle"
          options={[
            "Loose natural", "Box braids", "Faux locs", "Cornrows", "Locs", "Wig / unit",
            "Weave", "Relaxed", "Curly perm", "Silk press", "Wash and go",
            "Twist-out", "Finger comb coils",
          ]}
          value={style} onChange={setStyle}
        />

        <FormField
          label="How Long in This Style"
          value={howLong}
          onChange={(e) => setHowLong(e.target.value)}
          showTick={false}
        />

        <TagGroup
          label="Plans to Change Style"
          options={["Yes — in 5 weeks", "No plans yet"]}
          value={plans} onChange={setPlans}
        />

        {isChanging && (
          <MultiSelectDropdown
            label="Changing To"
            options={HAIRSTYLE_OPTIONS}
            value={changingTo}
            onChange={setChangingTo}
            placeholder="Select your next style…"
          />
        )}

        <MultiSelectDropdown
          label="Default / Normal Style"
          options={HAIRSTYLE_OPTIONS}
          value={defaultStyle}
          onChange={setDefaultStyle}
          placeholder="Select your usual styles…"
        />

        <Button
          variant="gold"
          size="pill"
          className="mt-4"
          onClick={() => {
            // Parse "How Long in This Style" — accept "9 days", "3 weeks", "5", etc.
            const match = howLong.trim().match(/(\d+)\s*(day|week|month)?s?/i);
            const num = match ? parseInt(match[1], 10) : NaN;
            const unit = (match?.[2] ?? "day").toLowerCase();
            const days = Number.isFinite(num)
              ? unit.startsWith("week")
                ? num * 7
                : unit.startsWith("month")
                ? num * 30
                : num
              : 0;
            const style_set_at = new Date(
              Date.now() - days * 24 * 60 * 60 * 1000,
            ).toISOString();
            // Use the same shape as SetCurrentStyle / Home so the value
            // pulls through to the "Current Style" card on the homescreen.
            localStorage.setItem(
              "strand_current_style",
              JSON.stringify({
                current_hairstyle: style[0] ?? "",
                style_set_at,
                planned_next_style: changingTo[0] ?? "",
                howLong,
                plans,
                changingTo,
                defaultStyle,
                colour,
                chemHist,
              }),
            );
            navigate("/onboarding/blood-timing");
          }}
        >
          Continue to Blood Test →
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default ProfileStep4Colour;
