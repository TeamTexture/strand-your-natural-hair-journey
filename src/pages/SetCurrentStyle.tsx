import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import Eyebrow from "@/components/nav/Eyebrow";
import ChoiceChips, { type Choice } from "@/components/nav/ChoiceChips";
import { ICONS } from "@/lib/iconMap";
import { CalendarClock } from "lucide-react";
import FormField from "@/components/FormField";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import TipsBlock from "@/components/tips/TipsBlock";
import StylePicker, { type StyleAttributesValue } from "@/components/style/StylePicker";
import {
  HAIRSTYLE_OPTIONS,
  styleAsksTension,
  styleAsksExtensions,
} from "@/lib/hairstyles";
import { useStyleTip } from "@/hooks/useStyleTip";
import { supabase } from "@/integrations/supabase/client";
import {
  invalidateClinicalContextCache,
  loadClinicalContext,
} from "@/lib/clinicalContext";
import { getDisplayedAuthUser } from "@/lib/displayedUser";

const UNIT_OPTIONS: Choice[] = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

interface ExistingStyleLocal {
  current_hairstyle?: string;
  style_set_at?: string;
  planned_next_style?: string;
  howLong?: string;
  howLongNum?: string;
  howLongUnit?: string;
  changingTo?: string[];
  defaultStyle?: string[];
  colour?: string[];
  chemHist?: string[];
  plans?: string[];
}

const readExistingLocal = (): ExistingStyleLocal => {
  try {
    return JSON.parse(localStorage.getItem("strand_current_style") ?? "{}");
  } catch {
    return {};
  }
};

const SetCurrentStyle = () => {
  const navigate = useNavigate();
  const { data: styleTips = [] } = useStyleTip();

  const [style, setStyle] = useState<string>("");
  const [howLongNum, setHowLongNum] = useState("");
  const [howLongUnit, setHowLongUnit] = useState<"days" | "weeks" | "months">("days");
  const [next, setNext] = useState<string[]>([]);
  const [attrs, setAttrs] = useState<StyleAttributesValue>({ tension: null, extensions: null });
  const [plannedAttrs, setPlannedAttrs] = useState<StyleAttributesValue>({
    tension: null,
    extensions: null,
  });
  const [attrError, setAttrError] = useState(false);

  // Hydrate from DB-first clinical context (falls back to localStorage when
  // no row exists yet — same fallback as the rest of Phase 1 reads).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ctx = await loadClinicalContext();
      if (cancelled) return;
      if (ctx.style) {
        setStyle(ctx.style.current_hairstyle ?? "");
        if (ctx.style.howLongNum) {
          setHowLongNum(ctx.style.howLongNum);
          setHowLongUnit((ctx.style.howLongUnit as "days" | "weeks" | "months") ?? "days");
        } else if (ctx.style.howLong) {
          const m = ctx.style.howLong.trim().match(/(\d+)\s*(day|week|month)?s?/i);
          setHowLongNum(m?.[1] ?? "");
          const u = (m?.[2] ?? "day").toLowerCase();
          setHowLongUnit(u.startsWith("week") ? "weeks" : u.startsWith("month") ? "months" : "days");
        }
        setNext(ctx.style.planned_next_style ? [ctx.style.planned_next_style] : []);
        const row = ctx.style as unknown as Record<string, unknown>;
        setAttrs({
          tension: (row.current_style_tension as string | null) ?? null,
          extensions: (row.current_style_extensions as boolean | null) ?? null,
        });
        setPlannedAttrs({
          tension: (row.planned_style_tension as string | null) ?? null,
          extensions: (row.planned_style_extensions as boolean | null) ?? null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!style) {
      toast.error("Pick your current hairstyle");
      return;
    }
    if (
      (styleAsksTension(style) && !attrs.tension) ||
      (styleAsksExtensions(style) && attrs.extensions === null)
    ) {
      setAttrError(true);
      toast.error("Answer the tension and extensions questions for this style");
      return;
    }
    setAttrError(false);

    const num = parseInt(howLongNum, 10);
    const days = Number.isFinite(num)
      ? howLongUnit === "weeks"
        ? num * 7
        : howLongUnit === "months"
        ? num * 30
        : num
      : 0;
    const style_set_at = new Date(Date.now() - days * 86_400_000).toISOString();
    const howLong = `${howLongNum} ${howLongUnit}`;

    // Dual-write: localStorage (fallback / legacy compat) + DB.
    const prev = readExistingLocal();
    localStorage.setItem(
      "strand_current_style",
      JSON.stringify({
        ...prev,
        current_hairstyle: style,
        style_set_at,
        planned_next_style: next[0] ?? "",
        howLong,
        howLongNum,
        howLongUnit,
        current_style_tension: styleAsksTension(style) ? attrs.tension : null,
        current_style_extensions: styleAsksExtensions(style) ? attrs.extensions : null,
        planned_style_tension: styleAsksTension(next[0]) ? plannedAttrs.tension : null,
        planned_style_extensions: styleAsksExtensions(next[0])
          ? plannedAttrs.extensions
          : null,
      }),
    );

    try {
      const { data: u } = await getDisplayedAuthUser();
      if (u?.user) {
        const { error } = await supabase
          .from("user_style_profile")
          .upsert(
            {
              user_id: u.user.id,
              current_hairstyle: style,
              style_set_at,
              planned_next_style: next[0] ?? null,
              current_style_tension: styleAsksTension(style) ? attrs.tension : null,
              current_style_extensions: styleAsksExtensions(style)
                ? attrs.extensions
                : null,
              planned_style_tension: styleAsksTension(next[0])
                ? plannedAttrs.tension
                : null,
              planned_style_extensions: styleAsksExtensions(next[0])
                ? plannedAttrs.extensions
                : null,
              // Colour / chemical history / default styles belong to
              // onboarding step 4 and are DELIBERATELY not sent here. Sending
              // them from the local snapshot overwrote real stored answers with
              // empty arrays whenever this device had no snapshot (2026-09-04).
              planned_change_date: null,
            },
            { onConflict: "user_id" },
          );
        if (error) throw error;
      }
    } catch (err) {
      // NEVER REPORT SUCCESS ON A FAILED SAVE (2026-09-04). The saved style is
      // what every personalised surface reads; swallowing this left her looking
      // at guidance for her previous style with no way to know why.
      console.error("[strand] user_style_profile upsert failed", err);
      toast.error("We couldn't save your style. Check your connection and try again.");
      return;
    }

    invalidateClinicalContextCache();
    // Notify same-tab listeners (Home banner). The native `storage` event only
    // fires in OTHER tabs, so we dispatch a custom event here too.
    window.dispatchEvent(new Event("strand:style-updated"));
    toast.success("Style updated");
    navigate("/home");
  };

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Current Hairstyle" back />

      <div className="px-5 pb-8 space-y-5">
        <div>
          <Eyebrow icon={ICONS.style} className="mb-2">Current Hairstyle</Eyebrow>
          <StylePicker
            value={style}
            onChange={(v) => { setStyle(v); setAttrError(false); }}
            attributes={attrs}
            onAttributesChange={(v) => { setAttrs(v); setAttrError(false); }}
            attributeError={attrError}
          />
        </div>

        <div>
          <Eyebrow icon={CalendarClock} className="mb-2">How long in this style</Eyebrow>
          <div className="flex gap-3 items-start">
            <Input
              type="number"
              min={0}
              value={howLongNum}
              onChange={(e) => setHowLongNum(e.target.value)}
              className="w-24"
            />
            <ChoiceChips
              className="flex-1"
              columns={3}
              compact
              options={UNIT_OPTIONS}
              value={howLongUnit}
              onChange={(v) => setHowLongUnit(v as "days" | "weeks" | "months")}
            />
          </div>
        </div>

        <MultiSelectDropdown
          label="Planned next style (optional)"
          options={HAIRSTYLE_OPTIONS}
          value={next}
          onChange={(v) => setNext(v.slice(-1))}
          placeholder="Select your next style…"
        />

        {(styleAsksTension(next[0]) || styleAsksExtensions(next[0])) && (
          <StylePicker
            value={next[0] ?? null}
            onChange={() => {}}
            attributes={plannedAttrs}
            onAttributesChange={setPlannedAttrs}
            attributesRequired={false}
            hideStyleOptions
          />
        )}

        <TipsBlock tips={styleTips} idPrefix="style-tip" />

        <Button variant="gold" size="pill" className="mt-4" onClick={() => void save()}>
          Save Style
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default SetCurrentStyle;
