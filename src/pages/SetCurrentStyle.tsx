import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import Tag from "@/components/Tag";
import FormField from "@/components/FormField";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

interface ExistingStyle {
  current_hairstyle?: string;
  style_set_at?: string;
  planned_next_style?: string;
  howLong?: string;
}

const readExisting = (): ExistingStyle => {
  try { return JSON.parse(localStorage.getItem("strand_current_style") ?? "{}"); }
  catch { return {}; }
};

const SetCurrentStyle = () => {
  const navigate = useNavigate();
  const existing = readExisting();

  const [style, setStyle] = useState<string>(existing.current_hairstyle ?? "");
  const [howLong, setHowLong] = useState(existing.howLong ?? "");
  const [next, setNext] = useState<string[]>(existing.planned_next_style ? [existing.planned_next_style] : []);

  const save = () => {
    if (!style) {
      toast.error("Pick your current hairstyle");
      return;
    }
    // Parse "How Long in This Style" — accept "9 days", "3 weeks", "5", etc.
    const match = howLong.trim().match(/(\d+)\s*(day|week|month)?s?/i);
    const num = match ? parseInt(match[1], 10) : NaN;
    const unit = (match?.[2] ?? "day").toLowerCase();
    const days = Number.isFinite(num)
      ? unit.startsWith("week") ? num * 7
      : unit.startsWith("month") ? num * 30
      : num
      : 0;
    const style_set_at = new Date(Date.now() - days * 86_400_000).toISOString();

    const prev = readExisting();
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

        <Button variant="gold" size="pill" className="mt-4" onClick={save}>
          Save Style
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default SetCurrentStyle;
