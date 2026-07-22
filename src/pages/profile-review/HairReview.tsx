import { smartBack } from "@/lib/smartBack";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ReviewField from "@/components/ReviewField";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  encryptForStorage,
  loadClinicalContext,
  invalidateClinicalContextCache,
} from "@/lib/clinicalContext";

const DIAMETER = ["Fine", "Medium", "Coarse", "Mixed"];
const TEXTURE = ["Rough / crinkly", "Medium", "Silky / glassy"];
const DENSITY = ["Low", "Medium", "High"];
const POROSITY = ["Low — tightly closed cuticle", "High — raised cuticle"];
const ELASTICITY = [
  "Strong — stretches and bounces back",
  "Weak — snaps or does not return",
];
const SCALP = ["Dry", "Oily", "Normal", "Sensitive", "Combination"];
const DIAGNOSED = [
  "Traction alopecia", "Androgenetic alopecia", "Alopecia areata", "CCCA",
  "Telogen effluvium", "Seborrheic dermatitis", "Folliculitis",
  "Scalp psoriasis", "Scalp eczema", "None diagnosed",
];
const AREAS = ["Edges / hairline", "Temples", "Crown", "Nape", "Overall thinning", "None"];
import { HAIR_LENGTH_BUCKETS, bucketFromInches } from "@/lib/hairLength";
const LENGTH_BUCKETS = HAIR_LENGTH_BUCKETS.map((b) => b.label);

const HairReview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const editKey = params.get("edit");

  const { data: hair } = useQuery({
    queryKey: ["profile-review", "hair", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      invalidateClinicalContextCache();
      const ctx = await loadClinicalContext({ allowLocalFallback: false });
      return ctx.hair;
    },
  });

  const invalidate = () => {
    invalidateClinicalContextCache();
    qc.invalidateQueries({ queryKey: ["profile-review", "hair"] });
    qc.invalidateQueries({ queryKey: ["profile", "clinical"] });
  };

  const upsertHair = async (patch: Record<string, unknown>) => {
    if (!user) return;
    const { error } = await supabase
      .from("user_hair_profile")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
    if (error) throw error;
    invalidate();
    toast.success("Saved");
  };

  const saveEncryptedList = async (
    key: "scalp_condition" | "diagnosed_conditions",
    values: string[],
  ) => {
    const enc = await encryptForStorage([
      { id: "v", plaintext: JSON.stringify(values) },
    ]);
    return upsertHair({ [`${key}_enc`]: enc.v });
  };

  return (
    <ScreenLayout>
      <TitleBar title="Hair characteristics" onBack={smartBack(navigate, "/profile")} />
      <div className="px-5 pb-8 space-y-3">
        <p className="text-[13px] text-muted-foreground leading-snug pb-1">
          Tap the pencil to update just one field at a time.
        </p>

        <ReviewField
          label="Strand diameter"
          value={(hair?.diameter ?? [])[0] ?? ""}
          kind={{ type: "chip-single", options: DIAMETER }}
          autoEdit={editKey === "diameter"}
          onSave={(v) => upsertHair({ diameter: String(v) })}
        />
        <ReviewField
          label="Surface texture"
          value={(hair?.texture ?? [])[0] ?? ""}
          kind={{ type: "chip-single", options: TEXTURE }}
          onSave={(v) => upsertHair({ surface_texture: String(v) })}
        />
        <ReviewField
          label="Density"
          value={(hair?.density ?? [])[0] ?? ""}
          kind={{ type: "chip-single", options: DENSITY }}
          onSave={(v) => upsertHair({ density: String(v) })}
        />
        <ReviewField
          label="Porosity"
          value={(hair?.porosity ?? [])[0] ?? ""}
          kind={{ type: "chip-single", options: POROSITY }}
          onSave={(v) => upsertHair({ porosity: String(v) })}
        />
        <ReviewField
          label="Elasticity"
          value={(hair?.elasticity ?? [])[0] ?? ""}
          kind={{ type: "chip-single", options: ELASTICITY }}
          onSave={(v) => upsertHair({ elasticity: String(v) })}
        />
        <ReviewField
          label="Scalp condition"
          value={(hair?.scalp ?? [])[0] ?? ""}
          kind={{ type: "chip-single", options: SCALP }}
          onSave={(v) => saveEncryptedList("scalp_condition", [String(v)])}
        />
        <ReviewField
          label="Diagnosed conditions"
          value={hair?.diagnosed ?? []}
          hint="Tap all that apply."
          kind={{ type: "chip-multi", options: DIAGNOSED }}
          onSave={(v) => saveEncryptedList("diagnosed_conditions", v as string[])}
        />
        <ReviewField
          label="Areas of concern"
          value={hair?.areas ?? []}
          hint="Tap all that apply."
          kind={{ type: "chip-multi", options: AREAS }}
          onSave={(v) => upsertHair({ areas_of_concern: v as string[] })}
        />
        <ReviewField
          label="Hair length (band)"
          value={hair?.length_bucket ?? ""}
          hint="Where your hair falls when pulled straight — coily hair shrinks a lot, so measure stretched."
          kind={{ type: "chip-single", options: LENGTH_BUCKETS }}
          onSave={(v) => {
            const label = String(v);
            const band = HAIR_LENGTH_BUCKETS.find((b) => b.label === label);
            const midpoint = band
              ? Number.isFinite(band.maxIn)
                ? Math.round(((band.minIn + Math.min(band.maxIn, band.minIn + 6)) / 2) * 10) / 10
                : band.minIn + 2
              : null;
            return upsertHair({
              length_bucket: label || null,
              // Only auto-fill inches if the user hasn't set an exact value.
              ...(hair?.length_inches == null && midpoint != null
                ? { length_inches: midpoint }
                : {}),
            });
          }}
        />
        <ReviewField
          label="Exact length (inches, stretched)"
          value={hair?.length_inches ?? ""}
          hint="Optional. Type the pulled-straight length in inches."
          kind={{ type: "number", min: 0, max: 60, placeholder: "e.g. 8" }}
          onSave={(v) => {
            const n = Number(v);
            const inches = Number.isFinite(n) && n > 0 ? n : null;
            const label = inches != null ? bucketFromInches(inches) : null;
            return upsertHair({
              length_inches: inches,
              length_bucket: label ?? hair?.length_bucket ?? null,
            });
          }}
        />
      </div>
    </ScreenLayout>
  );
};

export default HairReview;
