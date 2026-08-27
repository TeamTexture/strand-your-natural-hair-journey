// Add a homemade (DIY) product to the shelf.
//
// Deliberately NOT part of the scan/photo/link flows: there is no packaging to
// read, no brand and no INCI list. She types what she put in the bowl.
//
// Amounts are captured as a number + a unit (g, ml, tsp, tbsp, cup, drops,
// pumps) so the analysis gets real, machine-readable concentration data instead
// of parsing a loose string — with an "Other…" unit that reveals the old free
// text field for the amounts a kitchen actually uses ("a pinch", "a handful").
// Both parts stay optional: she can name an ingredient and skip the amount.
// The recipe stores ingredient + qty + unit AND the rendered `amount` string,
// and the ingredient NAMES are also written to the existing flat `ingredients`
// column so every downstream surface keeps working with no changes.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Camera } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { resolveProductKey } from "@/lib/productIdentity";
import { prepareImageForAi } from "@/lib/imagePrep";
import {
  HOMEMADE_CATEGORIES, RECIPE_UNITS, formatAmount, recipeIngredientNames,
  type RecipeItem,
} from "@/lib/homemade";
import { toast } from "sonner";

interface RowState {
  ingredient: string;
  qty: string;
  unit: string;
  /** Only used when unit === "other". */
  freeText: string;
}

const emptyRow = (): RowState => ({ ingredient: "", qty: "", unit: "", freeText: "" });

const AddHomemadeProduct = () => {
  const navigate = useNavigate();
  const { user, isViewingAs } = useAuth();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<RowState[]>([emptyRow(), emptyRow()]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const setRow = (i: number, patch: Partial<RowState>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const filled = rows.filter((r) => r.ingredient.trim().length > 0);
  const canSave = name.trim().length > 1 && !!category && filled.length >= 1;

  const save = async () => {
    if (!user || !canSave) return;
    if (isViewingAs) { toast.error("Read-only while viewing as a member"); return; }
    setSaving(true);
    try {
      const recipe: RecipeItem[] = filled.map((r) => {
        const qty = r.qty.trim();
        const structured = r.unit && r.unit !== "other";
        return {
          ingredient: r.ingredient.trim(),
          amount: formatAmount(qty, r.unit, r.freeText),
          ...(qty && structured ? { qty } : {}),
          ...(structured ? { unit: r.unit } : {}),
        };
      });


      let storagePath: string | null = null;
      if (photo) {
        try {
          const prepared = await prepareImageForAi(photo);
          const path = `${user.id}/homemade-${Date.now()}.jpg`;
          const { error } = await supabase.storage
            .from("product-photos")
            .upload(path, prepared.uploadFile, { contentType: "image/jpeg", upsert: true });
          if (!error) storagePath = path;
        } catch {
          // A photo is optional — never block saving the recipe on it.
        }
      }

      const { product_key } = await resolveProductKey(user.id, name.trim(), null);
      const { data, error } = await supabase
        .from("user_products")
        .upsert({
          user_id: user.id,
          product_key,
          name: name.trim(),
          brand: null,
          category,
          is_homemade: true,
          homemade_recipe: recipe as unknown as Json,
          // Kept in sync deliberately: every existing consumer reads this.
          ingredients: recipeIngredientNames(recipe),
          ingredients_source: "homemade",
          storage_path: storagePath,
          on_shelf: true,
          added_to_shelf_at: new Date().toISOString(),
        }, { onConflict: "user_id,product_key" })
        .select("id")
        .single();
      if (error) throw error;

      toast.success("Recipe saved — analysing it now");
      navigate(`/products/profile/${data.id}`, { replace: true });
    } catch (e) {
      console.error("homemade save failed", e);
      toast.error(e instanceof Error ? e.message : "Could not save your recipe");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenLayout bottomNav={false}>
      <TitleBar title="Homemade Product" back />
      <div className="px-5 pb-10 space-y-4">
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">
          Add something you mixed yourself. List what went in and roughly how
          much — "5 drops", "2 tbsp" and "a handful" are all fine. The analysis
          reads the amounts, not just the ingredients.
        </p>

        <SurfaceCard className="p-4 space-y-3">
          <div className="space-y-1.5">
            <SectionLabel>What do you call it?</SectionLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My shea &amp; aloe mask"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <SectionLabel>Category</SectionLabel>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
              <SelectContent>
                {HOMEMADE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4 space-y-3">
          <SectionLabel>What's in it?</SectionLabel>
          <div className="space-y-2.5">
            {rows.map((row, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1 space-y-1.5">
                  <Input
                    value={row.ingredient}
                    onChange={(e) => setRow(i, { ingredient: e.target.value })}
                    placeholder="Ingredient — e.g. shea butter"
                    maxLength={60}
                  />
                  <Input
                    value={row.amount}
                    onChange={(e) => setRow(i, { amount: e.target.value })}
                    placeholder="How much — e.g. 2 tbsp"
                    maxLength={40}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={rows.length <= 1}
                  aria-label="Remove ingredient"
                  className="size-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-primary/10 disabled:opacity-30"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="goldOutline"
            size="pill"
            className="w-full"
            onClick={() => setRows((prev) => [...prev, { ingredient: "", amount: "" }])}
          >
            <Plus className="size-4 mr-1.5" /> Add another ingredient
          </Button>
        </SurfaceCard>

        <SurfaceCard className="p-4 space-y-2">
          <SectionLabel>Photo (optional)</SectionLabel>
          <label className="flex items-center gap-2.5 text-[12.5px] text-foreground cursor-pointer min-h-[44px]">
            <Camera className="size-4 text-primary" />
            <span className="flex-1 truncate">
              {photo ? photo.name : "Add a photo of the mix or the jar"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        </SurfaceCard>

        <Button
          variant="gold"
          size="pill"
          className="w-full"
          disabled={!canSave || saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save & analyse"}
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default AddHomemadeProduct;
