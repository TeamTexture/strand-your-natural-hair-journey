import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Pencil, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ReviewField from "@/components/ReviewField";
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
import { useAuth } from "@/hooks/useAuth";
import {
  loadClinicalContext,
  invalidateClinicalContextCache,
} from "@/lib/clinicalContext";

const NATURAL_NEVER = "Natural (never coloured)";
const COLOUR = [NATURAL_NEVER, "Permanently dyed", "Bleached", "Demi-permanent", "Semi-permanent", "Henna ⚠"];
const CHEM_HIST = ["Relaxer current", "Relaxer past", "Texturiser", "Curly perm", "Heat damage", "None"];
const HAIRSTYLES = [
  "Loose natural", "Box braids", "Faux locs", "Cornrows", "Locs", "Wig / unit",
  "Weave", "Relaxed", "Curly perm", "Silk press", "Wash and go",
  "Twist-out", "Finger comb coils",
  "Low manipulation natural style", "Bald", "Low cut",
];
const COLOUR_TYPES = ["Professional colour", "Box dye", "Henna", "Not sure"];
const COLOUR_PRODUCTS = ["Colour", "Lightener (bleach)", "Not sure"];
const COLOUR_TIMEFRAMES = ["Within 8 weeks", "8–12 weeks", "3 months", "6 months", "Over 6 months", "Never coloured"];

type Unit = "days" | "weeks" | "months";
const daysFrom = (n: number, unit: Unit) =>
  unit === "weeks" ? n * 7 : unit === "months" ? n * 30 : n;

// Convert an ISO style_set_at back to a rough "X units ago" pair.
const styleAgeDisplay = (iso: string | null): string => {
  if (!iso) return "Not set";
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
};

const ColourReview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const editKey = params.get("edit");

  const { data: style } = useQuery({
    queryKey: ["profile-review", "style", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      invalidateClinicalContextCache();
      const ctx = await loadClinicalContext({ allowLocalFallback: false });
      return ctx.style;
    },
  });

  const invalidate = () => {
    invalidateClinicalContextCache();
    qc.invalidateQueries({ queryKey: ["profile-review", "style"] });
    qc.invalidateQueries({ queryKey: ["profile", "clinical"] });
    window.dispatchEvent(new Event("strand:style-updated"));
  };

  const upsertStyle = async (patch: Record<string, unknown>) => {
    if (!user) return;
    const { error } = await supabase
      .from("user_style_profile")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
    if (error) throw error;
    invalidate();
    toast.success("Saved");
  };

  // ── Custom editor for style + duration (a single "how long in this style") ──
  const [editingStyle, setEditingStyle] = useState(editKey === "current_style");
  const [saving, setSaving] = useState(false);
  const [styleDraft, setStyleDraft] = useState(style?.current_hairstyle ?? "");
  const [num, setNum] = useState("");
  const [unit, setUnit] = useState<Unit>("days");

  const openStyleEditor = () => {
    setStyleDraft(style?.current_hairstyle ?? "");
    setNum("");
    setUnit("days");
    setEditingStyle(true);
  };

  const saveStyle = async () => {
    if (!user) return;
    const n = parseInt(num, 10);
    const setAt = Number.isFinite(n) && n > 0
      ? new Date(Date.now() - daysFrom(n, unit) * 86400000).toISOString()
      : (style?.style_set_at ?? new Date().toISOString());
    setSaving(true);
    try {
      await upsertStyle({
        current_hairstyle: styleDraft || null,
        style_set_at: setAt,
      });
      setEditingStyle(false);
    } finally {
      setSaving(false);
    }
  };

  const styleAge = useMemo(
    () => styleAgeDisplay(style?.style_set_at ?? null),
    [style?.style_set_at],
  );

  return (
    <ScreenLayout>
      <TitleBar title="Colour & style" onBack={() => navigate("/profile")} />
      <div className="px-5 pb-8 space-y-3">
        <p className="text-[13px] text-muted-foreground leading-snug pb-1">
          Tap the pencil to update just one field at a time.
        </p>

        <ReviewField
          label="Current colour status"
          value={(style?.colour ?? [])[0] ?? ""}
          kind={{ type: "chip-single", options: COLOUR }}
          autoEdit={editKey === "colour"}
          onSave={(v) => {
            const nextVal = String(v);
            const patch: Record<string, unknown> = { current_colour_status: nextVal };
            // Selecting "Natural (never coloured)" hides + clears the chemical
            // and colour history sections.
            if (nextVal === NATURAL_NEVER) {
              patch.chemical_history = ["None"];
              patch.colour_type = null;
              patch.colour_product = null;
              patch.colour_last_treated = "Never coloured";
              patch.colour_reaction = false;
              patch.colour_reaction_details = null;
              patch.colour_reaction_audio_path = null;
            }
            return upsertStyle(patch);
          }}
        />
        {(style?.colour ?? [])[0] !== NATURAL_NEVER && (
          <ReviewField
            label="Chemical history"
            value={style?.chemical_history ?? []}
            hint="Tap all that apply."
            kind={{ type: "chip-multi", options: CHEM_HIST }}
            onSave={(v) => upsertStyle({ chemical_history: v as string[] })}
          />
        )}

        {/* Current style + duration */}
        <div className="rounded-[14px] border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
                Current hairstyle
              </div>
              {!editingStyle && (
                <>
                  <p className="mt-1.5 text-[15px] font-medium">
                    {style?.current_hairstyle || (
                      <span className="italic text-muted-foreground font-normal">
                        Not set
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    In this style for {styleAge}
                  </p>
                </>
              )}
            </div>
            {!editingStyle && (
              <button
                type="button"
                onClick={openStyleEditor}
                aria-label="Edit current style"
                className="shrink-0 size-8 rounded-full border border-border hover:border-primary hover:bg-primary/10 text-primary flex items-center justify-center"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>

          {editingStyle && (
            <div className="mt-3 space-y-3">
              <Select value={styleDraft} onValueChange={setStyleDraft}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a style…" />
                </SelectTrigger>
                <SelectContent>
                  {HAIRSTYLES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5">
                  How long in this style
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={num}
                    onChange={(e) => setNum(e.target.value)}
                    placeholder="0"
                    className="w-24"
                  />
                  <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
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
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Leave blank to keep the current start date.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="gold"
                  size="pill"
                  className="!min-h-[38px] !text-[12px] !px-4"
                  onClick={saveStyle}
                  disabled={saving || !styleDraft}
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Save
                </Button>
                <Button
                  type="button"
                  variant="goldOutline"
                  size="pill"
                  className="!min-h-[38px] !text-[12px] !px-4"
                  onClick={() => setEditingStyle(false)}
                  disabled={saving}
                >
                  <X className="size-3.5" /> Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <ReviewField
          label="Planned next style"
          value={style?.planned_next_style ?? ""}
          hint="Leave as 'Not sure yet' if undecided."
          kind={{ type: "select", options: HAIRSTYLES }}
          onSave={(v) => upsertStyle({ planned_next_style: String(v) })}
        />
        <ReviewField
          label="Default / normal styles"
          value={style?.default_styles ?? []}
          hint="Tap all that apply."
          kind={{ type: "chip-multi", options: HAIRSTYLES }}
          onSave={(v) => upsertStyle({ default_styles: v as string[] })}
        />

        {(style?.colour ?? [])[0] !== NATURAL_NEVER && (
          <>
            {/* ── Colour History ── */}
            <div className="pt-3">
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-body mb-2">
                Colour History
              </div>
              <p className="text-[13px] text-muted-foreground leading-snug pb-2">
                Shared with your professional pre-consultation.
              </p>
            </div>

            <ReviewField
              label="Colour type"
              value={style?.colour_type ?? ""}
              kind={{ type: "chip-single", options: COLOUR_TYPES }}
              onSave={(v) => upsertStyle({ colour_type: String(v) })}
            />
            <ReviewField
              label="Product used"
              value={style?.colour_product ?? ""}
              hint="Not sure? Select 'Not sure' and your professional will confirm at your appointment."
              kind={{ type: "chip-single", options: COLOUR_PRODUCTS }}
              onSave={(v) => upsertStyle({ colour_product: String(v) })}
            />
            <ReviewField
              label="Last colour treatment"
              value={style?.colour_last_treated ?? ""}
              kind={{ type: "chip-single", options: COLOUR_TIMEFRAMES }}
              onSave={(v) => upsertStyle({ colour_last_treated: String(v) })}
            />
            <ReviewField
              label="Ever reacted to hair colour?"
              value={style?.colour_reaction === true ? "Yes" : style?.colour_reaction === false ? "No" : ""}
              kind={{ type: "chip-single", options: ["Yes", "No"] }}
              onSave={(v) => upsertStyle({ colour_reaction: String(v) === "Yes" })}
            />
            {style?.colour_reaction === true && (
              <ReviewField
                label="What happened?"
                hint="Required — describe your reaction so your professional can review it."
                value={style?.colour_reaction_details ?? ""}
                kind={{ type: "text", placeholder: "e.g. scalp burning, itch…" }}
                onSave={(v) => {
                  const text = String(v).trim();
                  if (!text) {
                    toast.error("Please describe what happened.");
                    return Promise.reject(new Error("required"));
                  }
                  return upsertStyle({ colour_reaction_details: text });
                }}
              />
            )}
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default ColourReview;
