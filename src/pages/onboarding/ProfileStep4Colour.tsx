import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ProgressDots from "@/components/ProgressDots";
import Tag from "@/components/Tag";

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
import VoiceNoteField from "@/components/VoiceNoteField";

const NATURAL_NEVER = "Natural (never coloured)";

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

const COLOUR_TYPES = ["Professional colour", "Box dye", "Henna", "Not sure"];
const COLOUR_PRODUCTS = ["Colour", "Lightener (bleach)", "Not sure"];
const COLOUR_TIMEFRAMES = [
  "Within 8 weeks",
  "8–12 weeks",
  "3 months",
  "6 months",
  "Over 6 months",
  "Never coloured",
];

const ProfileStep4Colour = () => {
  const navigate = useNavigate();
  const [colour, setColour] = useState([NATURAL_NEVER]);
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

  // ── Colour History (added for consultation data) ──
  const [colourType, setColourType] = useState<string>("Not sure");
  const [colourProduct, setColourProduct] = useState<string>("Not sure");
  const [colourLast, setColourLast] = useState<string>("Never coloured");
  const [colourReaction, setColourReaction] = useState<"yes" | "no">("no");
  const [colourReactionDetails, setColourReactionDetails] = useState("");
  const [colourReactionAudioPath, setColourReactionAudioPath] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState(false);

  const isNaturalNever = colour[0] === NATURAL_NEVER;
  const isChanging = plansToChange === "yes";

  return (
    <ScreenLayout>
      <TitleBar title="Colour & Style" right={<span>6 of 9</span>} />
      <ProgressDots total={9} current={6} />

      <div className="px-5 pb-8 space-y-5">
        <TagGroup
          label="Current Colour Status"
          options={[NATURAL_NEVER, "Permanently dyed", "Bleached", "Demi-permanent", "Semi-permanent", "Henna ⚠"]}
          value={colour} onChange={setColour}
          multi={false}
        />

        {!isNaturalNever && (
          <>
            <TagGroup
              label="Chemical History"
              options={["Relaxer current", "Relaxer past", "Texturiser", "Curly perm", "Heat damage", "None"]}
              value={chemHist} onChange={setChemHist}
            />

            <div className="border-t border-border" />

            {/* ── Colour History ── */}
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
                Colour History
              </div>

              <div>
                <div className="text-[11px] font-medium text-foreground/80 mb-1.5">Colour type</div>
                <Select value={colourType} onValueChange={setColourType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLOUR_TYPES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="text-[11px] font-medium text-foreground/80 mb-1.5">Product used</div>
                <Select value={colourProduct} onValueChange={setColourProduct}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLOUR_PRODUCTS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1 italic">
                  Not sure? Select 'Not sure' and your professional will confirm at your appointment.
                </p>
              </div>

              <div>
                <div className="text-[11px] font-medium text-foreground/80 mb-1.5">
                  When was your last colour treatment?
                </div>
                <Select value={colourLast} onValueChange={setColourLast}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLOUR_TIMEFRAMES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <TagGroup
                label="Have you ever had a reaction to hair colour?"
                options={["Yes", "No"]}
                value={colourReaction === "yes" ? ["Yes"] : ["No"]}
                onChange={(v) => {
                  setColourReaction(v.includes("Yes") ? "yes" : "no");
                  setReactionError(false);
                }}
                multi={false}
              />

              {colourReaction === "yes" && (
                <VoiceNoteField
                  label="What happened?"
                  placeholder="e.g. scalp burning, itch, patchy shedding…"
                  value={colourReactionDetails}
                  onChange={(v) => { setColourReactionDetails(v); if (v.trim()) setReactionError(false); }}
                  audioPath={colourReactionAudioPath}
                  onAudioPathChange={(p) => { setColourReactionAudioPath(p); if (p) setReactionError(false); }}
                  folder="colour-reaction"
                  required
                  errorMessage={reactionError ? "Please describe what happened, or record a voice note." : undefined}
                />
              )}
            </div>

            <div className="border-t border-border" />
          </>
        )}




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
            // Require reaction details (text or voice note) when a reaction is flagged.
            if (
              !isNaturalNever &&
              colourReaction === "yes" &&
              !colourReactionDetails.trim() &&
              !colourReactionAudioPath
            ) {
              setReactionError(true);
              toast.error("Please describe what happened, or record a voice note.");
              return;
            }

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

            // When "Natural (never coloured)" is selected, chemical + colour history
            // sections are hidden — persist neutral values so stale data can't leak
            // through to advice.
            const chemHistToSave = isNaturalNever ? ["None"] : chemHist;
            const colourTypeToSave = isNaturalNever ? null : colourType;
            const colourProductToSave = isNaturalNever ? null : colourProduct;
            const colourLastToSave = isNaturalNever ? "Never coloured" : colourLast;
            const reactionFlag = !isNaturalNever && colourReaction === "yes";

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
                chemHist: chemHistToSave,
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
                      chemical_history: chemHistToSave,
                      current_hairstyle: style[0] ?? null,
                      style_set_at,
                      planned_next_style: changingTo[0] ?? null,
                      planned_change_date,
                      default_styles: defaultStyle,
                      colour_type: colourTypeToSave,
                      colour_product: colourProductToSave,
                      colour_last_treated: colourLastToSave,
                      colour_reaction: reactionFlag,
                      colour_reaction_details: reactionFlag ? colourReactionDetails || null : null,
                      colour_reaction_audio_path: reactionFlag ? colourReactionAudioPath : null,
                    } as never,
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
