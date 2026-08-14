import { useState } from "react";
import { useOnboardingDraft } from "@/hooks/useOnboardingDraft";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { onboardingBack } from "@/lib/onboardingFlow";
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
import LevelGate from "@/components/tips/LevelGate";
import VoiceNoteField from "@/components/VoiceNoteField";
import StylePicker, { type StyleAttributesValue } from "@/components/style/StylePicker";
import {
  HAIRSTYLE_OPTIONS,
  styleAsksTension,
  styleAsksExtensions,
} from "@/lib/hairstyles";

const NATURAL_NEVER = "Natural (never coloured)";

interface TGProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (n: string[]) => void;
  multi?: boolean;
}
const TagGroup = ({ label, options, value, onChange, multi = true }: TGProps) => {
  const safeValue = Array.isArray(value) ? value : [];
  return <div>
    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">{label}</div>
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Tag
          key={o}
          selected={safeValue.includes(o)}
          onClick={() =>
            multi
              ? onChange(safeValue.includes(o) ? safeValue.filter((v) => v !== o) : [...safeValue, o])
              : onChange([o])
          }
        >
          {o}
        </Tag>
      ))}
    </div>
  </div>;
};

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
  const queryClient = useQueryClient();
  // No pre-filled answers anywhere on this step — a silent default became the
  // member's real profile and drove their guidance.
  const [colour, setColour] = useState<string[]>([]);
  const [chemHist, setChemHist] = useState<string[]>([]);
  const [style, setStyle] = useState<string[]>([]);
  const [howLongNum, setHowLongNum] = useState("");
  const [howLongUnit, setHowLongUnit] = useState<"days" | "weeks" | "months">("weeks");
  const [plansToChange, setPlansToChange] = useState<"yes" | "no" | null>(null);
  const [changeNum, setChangeNum] = useState("");
  const [changeUnit, setChangeUnit] = useState<"days" | "weeks" | "months">("weeks");
  const [changingTo, setChangingTo] = useState<string[]>([]);
  const [defaultStyle, setDefaultStyle] = useState<string[]>([]);

  // ── Colour History (added for consultation data) ──
  const [colourType, setColourType] = useState<string>("");
  const [colourProduct, setColourProduct] = useState<string>("");
  const [colourLast, setColourLast] = useState<string>("");
  const [colourReaction, setColourReaction] = useState<"yes" | "no" | null>(null);
  const [colourReactionDetails, setColourReactionDetails] = useState("");
  const [colourReactionAudioPath, setColourReactionAudioPath] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState(false);
  const [attrs, setAttrs] = useState<StyleAttributesValue>({ tension: null, extensions: null });
  const [plannedAttrs, setPlannedAttrs] = useState<StyleAttributesValue>({
    tension: null,
    extensions: null,
  });
  const [attrError, setAttrError] = useState(false);

  // Keep everything entered on this step if the member navigates back and forth.
  useOnboardingDraft(
    "profile-step-4-colour",
    {
      colour, chemHist, style, howLongNum, howLongUnit, plansToChange, changeNum, changeUnit,
      changingTo, defaultStyle, colourType, colourProduct, colourLast, colourReaction,
      colourReactionDetails, colourReactionAudioPath, attrs, plannedAttrs,
    },
    (d) => {
      if (Array.isArray(d.colour)) setColour(d.colour.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.chemHist)) setChemHist(d.chemHist.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.style)) setStyle(d.style.filter((v): v is string => typeof v === "string"));
      if (typeof d.howLongNum === "string") setHowLongNum(d.howLongNum);
      if (d.howLongUnit === "days" || d.howLongUnit === "weeks" || d.howLongUnit === "months") setHowLongUnit(d.howLongUnit);
      if (d.plansToChange === "yes" || d.plansToChange === "no") setPlansToChange(d.plansToChange);
      if (typeof d.changeNum === "string") setChangeNum(d.changeNum);
      if (d.changeUnit === "days" || d.changeUnit === "weeks" || d.changeUnit === "months") setChangeUnit(d.changeUnit);
      if (Array.isArray(d.changingTo)) setChangingTo(d.changingTo.filter((v): v is string => typeof v === "string"));
      if (Array.isArray(d.defaultStyle)) setDefaultStyle(d.defaultStyle.filter((v): v is string => typeof v === "string"));
      if (typeof d.colourType === "string") setColourType(d.colourType);
      if (typeof d.colourProduct === "string") setColourProduct(d.colourProduct);
      if (typeof d.colourLast === "string") setColourLast(d.colourLast);
      if (d.colourReaction === "yes" || d.colourReaction === "no") setColourReaction(d.colourReaction);
      if (typeof d.colourReactionDetails === "string") setColourReactionDetails(d.colourReactionDetails);
      if (typeof d.colourReactionAudioPath === "string" || d.colourReactionAudioPath === null) setColourReactionAudioPath(d.colourReactionAudioPath);
      if (d.attrs && typeof d.attrs === "object") setAttrs(d.attrs);
      if (d.plannedAttrs && typeof d.plannedAttrs === "object") setPlannedAttrs(d.plannedAttrs);
    },
  );

  const isNaturalNever = colour[0] === NATURAL_NEVER;
  const isChanging = plansToChange === "yes";

  return (
    <ScreenLayout>
      <TitleBar title="Colour & Style" onBack={onboardingBack(navigate, "/onboarding/profile-step-4-colour")} right={<span>6 of 9</span>} />
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
                  <SelectTrigger><SelectValue placeholder="Select colour type…" /></SelectTrigger>
                  <SelectContent>
                    {COLOUR_TYPES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="text-[11px] font-medium text-foreground/80 mb-1.5">Product used</div>
                <Select value={colourProduct} onValueChange={setColourProduct}>
                  <SelectTrigger><SelectValue placeholder="Select product used…" /></SelectTrigger>
                  <SelectContent>
                    {COLOUR_PRODUCTS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                <LevelGate min={2}>
                  <p className="text-[11px] text-muted-foreground mt-1 italic">
                    Not sure? Select 'Not sure' and your professional will confirm at your appointment.
                  </p>
                </LevelGate>
              </div>

              <div>
                <div className="text-[11px] font-medium text-foreground/80 mb-1.5">
                  When was your last colour treatment?
                </div>
                <Select value={colourLast} onValueChange={setColourLast}>
                  <SelectTrigger><SelectValue placeholder="Select a timeframe…" /></SelectTrigger>
                  <SelectContent>
                    {COLOUR_TIMEFRAMES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <TagGroup
                label="Have you ever had a reaction to hair colour?"
                options={["Yes", "No"]}
                value={colourReaction === "yes" ? ["Yes"] : colourReaction === "no" ? ["No"] : []}
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




        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
            Current hairstyle
          </div>
          <StylePicker
            value={style[0] ?? null}
            onChange={(v) => {
              setStyle([v]);
              setAttrError(false);
            }}
            attributes={attrs}
            onAttributesChange={(v) => {
              setAttrs(v);
              setAttrError(false);
            }}
            attributeError={attrError}
          />
        </div>

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
              maxSelected={1}
            />

            {(styleAsksTension(changingTo[0]) || styleAsksExtensions(changingTo[0])) && (
              <StylePicker
                hideStyleOptions
                value={changingTo[0] ?? null}
                onChange={() => {}}
                attributes={plannedAttrs}
                onAttributesChange={setPlannedAttrs}
                attributesRequired={false}
              />
            )}
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
            // Every answer on this step must be explicit.
            const gaps: string[] = [];
            if (colour.length === 0) gaps.push("current colour status");
            if (!isNaturalNever) {
              if (chemHist.length === 0) gaps.push("chemical history");
              if (!colourType) gaps.push("colour type");
              if (!colourProduct) gaps.push("product used");
              if (!colourLast) gaps.push("last colour treatment");
              if (!colourReaction) gaps.push("colour reaction");
            }
            if (!style[0]) gaps.push("current hairstyle");
            if (howLongNum.trim() === "" || !Number.isFinite(parseInt(howLongNum, 10))) {
              gaps.push("how long in this style");
            }
            if (!plansToChange) gaps.push("plans to change style");
            if (plansToChange === "yes") {
              if (changeNum.trim() === "") gaps.push("when you plan to change");
              if (changingTo.length === 0) gaps.push("what you are changing to");
            }
            if (defaultStyle.length === 0) gaps.push("default / normal style");
            if (gaps.length > 0) {
              toast.error(`Please answer ${gaps[0]} — ${gaps.length} question${gaps.length === 1 ? "" : "s"} still to go.`);
              return;
            }

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
            const currentStyle = style[0] ?? "";
            if (
              (styleAsksTension(currentStyle) && !attrs.tension) ||
              (styleAsksExtensions(currentStyle) && attrs.extensions === null)
            ) {
              setAttrError(true);
              toast.error("Answer the tension and extensions questions for this style");
              return;
            }
            setAttrError(false);

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
                current_style_tension: styleAsksTension(style[0]) ? attrs.tension : null,
                current_style_extensions: styleAsksExtensions(style[0])
                  ? attrs.extensions
                  : null,
                planned_style_tension: styleAsksTension(changingTo[0])
                  ? plannedAttrs.tension
                  : null,
                planned_style_extensions: styleAsksExtensions(changingTo[0])
                  ? plannedAttrs.extensions
                  : null,
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
                      current_style_tension: styleAsksTension(style[0]) ? attrs.tension : null,
                      current_style_extensions: styleAsksExtensions(style[0])
                        ? attrs.extensions
                        : null,
                      planned_style_tension: styleAsksTension(changingTo[0])
                        ? plannedAttrs.tension
                        : null,
                      planned_style_extensions: styleAsksExtensions(changingTo[0])
                        ? plannedAttrs.extensions
                        : null,
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
            const { data: currentUser } = await supabase.auth.getUser();
            await queryClient.invalidateQueries({ queryKey: ["consumer_onboarding_route", currentUser.user?.id] });
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
