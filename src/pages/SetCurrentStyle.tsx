import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import Tag from "@/components/Tag";
import FormField from "@/components/FormField";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import { Button } from "@/components/ui/button";
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
  const [howLong, setHowLong] = useState("");
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
        setHowLong(ctx.style.howLong ?? "");
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
    const style_set_at = new Date(Date.now() - days * 86_400_000).toISOString();

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
    <ScreenLayout>
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

        <FormField
          label="How long in this style"
          placeholder="e.g. 9 days, 3 weeks"
          value={howLong}
          onChange={(e) => setHowLong(e.target.value)}
          showTick={false}
        />

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
