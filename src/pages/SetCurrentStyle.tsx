import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  invalidateClinicalContextCache,
  loadClinicalContext,
} from "@/lib/clinicalContext";

const HAIRSTYLE_OPTIONS = [
  "Loose natural",
  "Box braids",
  "Faux locs",
  "Cornrows",
  "Locs",
  "Wig / unit",
  "Weave",
  "Relaxed",
  "Curly perm",
  "Silk press",
  "Wash and go",
  "Twist-out",
  "Finger comb coils",
  "Not sure yet",
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

  const [style, setStyle] = useState<string>("");
  const [howLongNum, setHowLongNum] = useState("");
  const [howLongUnit, setHowLongUnit] = useState<"days" | "weeks" | "months">("days");
  const [next, setNext] = useState<string[]>([]);

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
      }),
    );

    try {
      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        const { error } = await supabase
          .from("user_style_profile")
          .upsert(
            {
              user_id: u.user.id,
              current_hairstyle: style,
              style_set_at,
              planned_next_style: next[0] ?? null,
              // Preserve any colour/chemical/default-styles already stored —
              // those come from onboarding step 4. SetCurrentStyle only
              // changes the active style fields.
              chemical_history: prev.chemHist ?? [],
              default_styles: prev.defaultStyle ?? [],
              current_colour_status: prev.colour?.[0] ?? null,
              planned_change_date: null,
            },
            { onConflict: "user_id" },
          );
        if (error) throw error;
      }
    } catch (err) {
      console.warn("[strand] user_style_profile upsert failed", err);
      // localStorage write succeeded — don't block the user.
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
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
            Current Hairstyle
          </div>
          <div className="flex flex-wrap gap-2">
            {HAIRSTYLE_OPTIONS.filter(o => o !== "Not sure yet").map(o => (
              <Tag key={o} selected={style === o} onClick={() => setStyle(o)}>
                {o}
              </Tag>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
            How long in this style
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

        <MultiSelectDropdown
          label="Planned next style (optional)"
          options={HAIRSTYLE_OPTIONS}
          value={next}
          onChange={(v) => setNext(v.slice(-1))}
          placeholder="Select your next style…"
        />

        <Button variant="gold" size="pill" className="mt-4" onClick={() => void save()}>
          Save Style
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default SetCurrentStyle;
