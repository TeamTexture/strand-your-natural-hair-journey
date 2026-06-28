import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import Tag from "@/components/Tag";
import FormField from "@/components/FormField";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  "Low manipulation natural style",
  "Bald",
  "Low cut",
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
  const [howLongNum, setHowLongNum] = useState("9");
  const [howLongUnit, setHowLongUnit] = useState<"days" | "weeks" | "months">("days");
  const [plansToChange, setPlansToChange] = useState<"yes" | "no">("no");
  const [changeNum, setChangeNum] = useState("");
  const [changeUnit, setChangeUnit] = useState<"days" | "weeks" | "months">("weeks");
  const [changingTo, setChangingTo] = useState<string[]>(["Loose natural"]);
  const [defaultStyle, setDefaultStyle] = useState<string[]>([
    "Box braids",
    "Loose natural",
  ]);

  const isChanging = plansToChange === "yes";

  return (
    <ScreenLayout>
      <TitleBar title="Colour & Style" right={<span>6 of 9</span>} />
      <ProgressDots total={9} current={6} />

      <div className="px-5 pb-8 space-y-5">
        <TagGroup
          label="Current Colour Status"
          options={["Natural", "Permanently dyed", "Bleached", "Demi-permanent", "Semi-permanent", "Henna ⚠"]}
          value={colour} onChange={setColour}
          multi={false}
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
            "Low manipulation natural style", "Bald", "Low cut",
          ]}
          value={style} onChange={setStyle}
          multi={false}
        />

        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
            How Long in This Style
          </div>
          <div className="flex gap-3">
            <Input
              type="number"
              min={0}
              value={howLongNum}
              onChange={(e) => setHowLongNum(e.target.value)}
              className="w-24"
            />
            <Select
              value={howLongUnit}
              onValueChange={(v) => setHowLongUnit(v as "days" | "weeks" | "months")}
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="days">Days</SelectItem>
                <SelectItem value="weeks">Weeks</SelectItem>
                <SelectItem value="months">Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TagGroup
          label="Plans to Change Style"
          options={["Yes", "No"]}
          value={plansToChange === "yes" ? ["Yes"] : plansToChange === "no" ? ["No"] : []}
          onChange={(v) => setPlansToChange(v.includes("Yes") ? "yes" : "no")}
          multi={false}
        />

        {isChanging && (
          <>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
                When do you plan to change it?
              </div>
              <div className="flex gap-3">
                <Input
                  type="number"
                  min={0}
                  value={changeNum}
                  onChange={(e) => setChangeNum(e.target.value)}
                  className="w-24"
                />
                <Select
                  value={changeUnit}
                  onValueChange={(v) => setChangeUnit(v as "days" | "weeks" | "months")}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <MultiSelectDropdown
              label="Changing To"
              options={HAIRSTYLE_OPTIONS}
              value={changingTo}
              onChange={setChangingTo}
              placeholder="Select your next style…"
            />
          </>
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
          onClick={async () => {
            const num = parseInt(howLongNum, 10);
            const unit = howLongUnit;
            const days = Number.isFinite(num)
              ? unit === "weeks"
                ? num * 7
                : unit === "months"
                ? num * 30
                : num
              : 0;
            const howLong = `${howLongNum} ${howLongUnit}`;
            const style_set_at = new Date(
              Date.now() - days * 24 * 60 * 60 * 1000,
            ).toISOString();

            let planned_change_date: string | null = null;
            if (plansToChange === "yes") {
              const cNum = parseInt(changeNum, 10);
              const cDays = Number.isFinite(cNum)
                ? changeUnit === "weeks"
                  ? cNum * 7
                  : changeUnit === "months"
                  ? cNum * 30
                  : cNum
                : 0;
              planned_change_date = new Date(
                Date.now() + cDays * 24 * 60 * 60 * 1000,
              ).toISOString();
            }

            // Use the same shape as SetCurrentStyle / Home so the value
            // pulls through to the "Current Style" card on the homescreen.
            localStorage.setItem(
              "strand_current_style",
              JSON.stringify({
                current_hairstyle: style[0] ?? "",
                style_set_at,
                planned_next_style: changingTo[0] ?? "",
                planned_change_date,
                howLong,
                howLongNum,
                howLongUnit,
                plansToChange,
                changeNum,
                changeUnit,
                changingTo,
                defaultStyle,
                colour,
                chemHist,
              }),
            );
            // Dual-write to user_style_profile. PHASE_1_PLAN.md §15.
            try {
              const { data: u } = await supabase.auth.getUser();
              if (u?.user) {
                const { error } = await supabase
                  .from("user_style_profile")
                  .upsert(
                    {
                      user_id: u.user.id,
                      current_colour_status: colour[0] ?? null,
                      chemical_history: chemHist,
                      current_hairstyle: style[0] ?? null,
                      style_set_at,
                      planned_next_style: changingTo[0] ?? null,
                      planned_change_date,
                      default_styles: defaultStyle,
                    },
                    { onConflict: "user_id" },
                  );
                if (error) throw error;
              }
            } catch (err) {
              console.error("[strand] user_style_profile upsert failed", err);
              toast.error("Could not save your style profile. Check your connection.");
              return;
            }
            // Same-tab listeners (Home banner) need a custom event because the
            // browser `storage` event only fires in OTHER tabs.
            window.dispatchEvent(new Event("strand:style-updated"));
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
