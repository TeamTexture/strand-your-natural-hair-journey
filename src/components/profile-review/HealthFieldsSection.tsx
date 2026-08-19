import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import ReviewField from "@/components/ReviewField";
import { Button } from "@/components/ui/button";
import MedicationPicker from "@/components/MedicationPicker";
import SupplementPicker, { type SelectedSupplement } from "@/components/SupplementPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSupplements } from "@/hooks/useSupplements";
import {
  encryptForStorage,
  loadClinicalContext,
  invalidateClinicalContextCache,
} from "@/lib/clinicalContext";
import { DIET_OPTIONS, canonDiet, displayDiet } from "@/lib/dietaryPattern";
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
} from "@/lib/healthOptions";


const LIFE_STAGE = [...LIFE_STAGE_OPTIONS];
const CONTRACEPTION = [...CONTRACEPTION_OPTIONS];
const CONDITIONS = [...CONDITIONS_OPTIONS];
const DIET = [...DIET_OPTIONS];
const DIET_BALANCE = [...DIET_BALANCE_OPTIONS];
const SMOKE = [...SMOKE_OPTIONS];
const ALCOHOL = [...ALCOHOL_OPTIONS];
const WATER = [...WATER_OPTIONS];
const EXERCISE = [...EXERCISE_OPTIONS];
const SLEEP = [...SLEEP_OPTIONS];

const canonAlcohol = (v: string): string => {
  const l = v.toLowerCase();
  if (l === "none") return "none";
  if (l.includes("light")) return "light";
  if (l.includes("moderate")) return "moderate";
  if (l.includes("heavy")) return "heavy";
  return "unknown";
};

const displayAlcohol = (canon: string | null | undefined): string => {
  switch (canon) {
    case "none": return "None";
    case "light": return "Light social";
    case "moderate": return "Moderate";
    case "heavy": return "Heavy";
    default: return "";
  }
};


export default function HealthFieldsSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const editKey = params.get("edit");
  const [medsOpen, setMedsOpen] = useState(false);
  const [savingMeds, setSavingMeds] = useState(false);
  const [medsDraft, setMedsDraft] = useState<{ name: string; category: string }[]>([]);
  const [suppsOpen, setSuppsOpen] = useState(false);
  const [savingSupps, setSavingSupps] = useState(false);
  const [suppsDraft, setSuppsDraft] = useState<SelectedSupplement[]>([]);
  const { supplements, add: addSupplement, remove: removeSupplement } = useSupplements();

  const { data } = useQuery({
    queryKey: ["profile-review", "health", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      invalidateClinicalContextCache();
      const ctx = await loadClinicalContext({ allowLocalFallback: false });
      const { data: rows } = await supabase
        .from("user_medications")
        .select("name, category")
        .eq("user_id", user!.id);
      return {
        health: ctx.health,
        meds: (rows ?? []).map((r) => ({
          name: r.name ?? "",
          category: r.category ?? "",
        })),
      };
    },
  });

  const invalidate = () => {
    invalidateClinicalContextCache();
    qc.invalidateQueries({ queryKey: ["profile-review", "health"] });
    qc.invalidateQueries({ queryKey: ["profile", "clinical"] });
  };

  const upsertHealth = async (patch: Record<string, unknown>) => {
    if (!user) return;
    const { error } = await supabase
      .from("user_health_profile")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
    if (error) throw error;
    invalidate();
    toast.success("Saved");
  };

  const saveEncryptedList = async (
    key: "life_stage" | "contraception" | "medical_conditions",
    values: string[],
  ) => {
    const enc = await encryptForStorage([
      { id: "v", plaintext: JSON.stringify(values) },
    ]);
    return upsertHealth({ [`${key}_enc`]: enc.v });
  };

  const saveMedications = async () => {
    if (!user) return;
    setSavingMeds(true);
    try {
      await supabase.from("user_medications").delete().eq("user_id", user.id);
      const capped = medsDraft.filter((m) => m.name.trim()).slice(0, 20);
      if (capped.length > 0) {
        const items = capped.flatMap((m, i) => [
          { id: `${i}_name`, plaintext: m.name },
          { id: `${i}_category`, plaintext: m.category ?? "" },
        ]);
        const enc = await encryptForStorage(items);
        const { error } = await supabase.from("user_medications").insert(
          capped.map((m, i) => ({
            user_id: user.id,
            name: m.name,
            category: m.category,
            name_enc: enc[`${i}_name`],
            category_enc: enc[`${i}_category`],
          })),
        );
        if (error) throw error;
      }
      invalidate();
      setMedsOpen(false);
      toast.success("Medications saved");
    } catch (e) {
      console.error(e);
      toast.error("Could not save medications");
    } finally {
      setSavingMeds(false);
    }
  };

  /**
   * Diff-save supplements so we only add/remove the changed rows — existing
   * entries (dose, frequency, photo added on the Nutrition tab) are preserved.
   */
  const saveSupplements = async () => {
    setSavingSupps(true);
    try {
      const existingByName = new Map(supplements.map((s) => [s.name.toLowerCase(), s]));
      const draftNames = new Set(suppsDraft.map((s) => s.name.toLowerCase()));
      const toAdd = suppsDraft.filter((s) => !existingByName.has(s.name.toLowerCase()));
      const toRemove = supplements.filter((s) => !draftNames.has(s.name.toLowerCase()));
      for (const s of toAdd) {
        await addSupplement.mutateAsync({ name: s.name, source: "manual" });
      }
      for (const s of toRemove) {
        await removeSupplement.mutateAsync(s.id);
      }
      setSuppsOpen(false);
      toast.success("Supplements saved");
    } catch (e) {
      console.error(e);
      toast.error("Could not save supplements");
    } finally {
      setSavingSupps(false);
    }
  };

  const h = data?.health;
  const medsList = data?.meds ?? [];

  return (
    <div className="space-y-3">
      <ReviewField
        label="Life stage"
        value={h?.lifeStage ?? []}
        kind={{ type: "chip-single", options: LIFE_STAGE }}
        autoEdit={editKey === "life_stage"}
        onSave={(v) => saveEncryptedList("life_stage", [String(v)])}
      />
      <ReviewField
        label="Contraception"
        value={h?.contraception ?? []}
        kind={{ type: "chip-single", options: CONTRACEPTION }}
        autoEdit={editKey === "contraception"}
        onSave={(v) => saveEncryptedList("contraception", [String(v)])}
      />
      <ReviewField
        label="Medical conditions"
        value={h?.conditions ?? []}
        hint="Tap all that apply."
        kind={{ type: "chip-multi", options: CONDITIONS }}
        autoEdit={editKey === "conditions"}
        onSave={(v) => saveEncryptedList("medical_conditions", v as string[])}
      />

      <div className="border-t border-border my-2" />

      <ReviewField
        label="Diet type"
        value={displayDiet(h?.diet)}
        kind={{ type: "chip-single", options: DIET }}
        onSave={(v) => upsertHealth({ diet: canonDiet(String(v)) })}
      />
      {canonDiet(h?.diet) === "other" && (
        <ReviewField
          label="What you avoid"
          value={h?.dietOther ?? ""}
          hint="Optional. Tell us what you don't eat and your guidance will match it. Until you do, we keep every food suggestion plant-based."
          kind={{ type: "text", placeholder: "e.g. no dairy, no pork", maxLength: 200 }}
          onSave={(v) => upsertHealth({ diet_other: String(v).trim() || null })}
        />
      )}

      <ReviewField
        label="Diet balance"
        value={(h?.dietBalance ?? [])[0] ?? ""}
        kind={{ type: "chip-single", options: DIET_BALANCE }}
        onSave={(v) => upsertHealth({ diet_balance: String(v) })}
      />
      <ReviewField
        label="Smoking"
        value={(h?.smoke ?? [])[0] ?? ""}
        kind={{ type: "chip-single", options: SMOKE }}
        onSave={(v) => upsertHealth({ smoke: String(v) })}
      />
      <ReviewField
        label="Alcohol"
        value={displayAlcohol(h?.alcohol)}
        kind={{ type: "chip-single", options: ALCOHOL }}
        onSave={(v) => upsertHealth({ alcohol: canonAlcohol(String(v)) })}
      />
      <ReviewField
        label="Daily water"
        value={(h?.water ?? [])[0] ?? ""}
        kind={{ type: "chip-single", options: WATER }}
        onSave={(v) => upsertHealth({ daily_water: String(v) })}
      />
      <ReviewField
        label="Exercise"
        value={(h?.exercise ?? [])[0] ?? ""}
        kind={{ type: "chip-single", options: EXERCISE }}
        onSave={(v) => upsertHealth({ exercise: String(v) })}
      />
      <ReviewField
        label="Sleep quality"
        value={(h?.sleep ?? [])[0] ?? ""}
        kind={{ type: "chip-single", options: SLEEP }}
        onSave={(v) => upsertHealth({ sleep_quality: String(v) })}
      />

      {/* Medications — dedicated editor */}
      <div className="rounded-[14px] border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
              Medications
            </div>
            {!medsOpen && (
              <>
                {medsList.length === 0 ? (
                  <p className="mt-1.5 text-[15px] italic text-muted-foreground">
                    None added
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {medsList.map((m, i) => (
                      <span
                        key={`${m.name}-${i}`}
                        className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[13px] font-medium"
                      >
                        {m.name}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          {!medsOpen && (
            <button
              type="button"
              onClick={() => {
                setMedsDraft(medsList);
                setMedsOpen(true);
              }}
              aria-label="Edit medications"
              className="shrink-0 size-8 rounded-full border border-border hover:border-primary hover:bg-primary/10 text-primary flex items-center justify-center"
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
        {medsOpen && (
          <div className="mt-3 space-y-3">
            <MedicationPicker value={medsDraft} onChange={setMedsDraft} />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="gold"
                size="pill"
                className="!min-h-[38px] !text-[12px] !px-4"
                onClick={saveMedications}
                disabled={savingMeds}
              >
                {savingMeds ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="goldOutline"
                size="pill"
                className="!min-h-[38px] !text-[12px] !px-4"
                onClick={() => setMedsOpen(false)}
                disabled={savingMeds}
              >
                <X className="size-3.5" /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Supplements — dedicated editor */}
      <div className="rounded-[14px] border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
              Supplements
            </div>
            {!suppsOpen && (
              <>
                {supplements.length === 0 ? (
                  <p className="mt-1.5 text-[15px] italic text-muted-foreground">
                    None added
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {supplements.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[13px] font-medium"
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          {!suppsOpen && (
            <button
              type="button"
              onClick={() => {
                setSuppsDraft(supplements.map((s) => ({ name: s.name })));
                setSuppsOpen(true);
              }}
              aria-label="Edit supplements"
              className="shrink-0 size-8 rounded-full border border-border hover:border-primary hover:bg-primary/10 text-primary flex items-center justify-center"
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
        {suppsOpen && (
          <div className="mt-3 space-y-3">
            <SupplementPicker value={suppsDraft} onChange={setSuppsDraft} />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="gold"
                size="pill"
                className="!min-h-[38px] !text-[12px] !px-4"
                onClick={saveSupplements}
                disabled={savingSupps}
              >
                {savingSupps ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="goldOutline"
                size="pill"
                className="!min-h-[38px] !text-[12px] !px-4"
                onClick={() => setSuppsOpen(false)}
                disabled={savingSupps}
              >
                <X className="size-3.5" /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
