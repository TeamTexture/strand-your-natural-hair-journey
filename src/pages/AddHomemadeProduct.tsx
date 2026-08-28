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

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Camera, ScanLine } from "lucide-react";

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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { detectCommercialLabel } from "@/lib/commercialLabelDetect";
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
  const [scanning, setScanning] = useState(false);
  /** True once a scan has populated rows — recorded on the saved row's source. */
  const [scanUsed, setScanUsed] = useState(false);
  /** The scanned recipe photo — used as the product image when she adds none. */
  const [scanPhoto, setScanPhoto] = useState<File | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  /** Set when the list looks like a scanned shop-bought label, not a recipe. */
  const [commercialPrompt, setCommercialPrompt] = useState(false);

  const setRow = (i: number, patch: Partial<RowState>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // Reads HER OWN written recipe (notecard, jar label, notes screenshot) and
  // fills the same structured rows the manual form uses. Never saves: OCR
  // misreads a handwritten "2" as a "z", so she reviews and edits first.
  const scanRecipe = async (file: File) => {
    setScanning(true);
    try {
      const prepared = await prepareImageForAi(file);
      const [, mime, b64] = prepared.dataUrl.match(/^data:([^;]+);base64,(.*)$/) ?? [];
      if (!b64) throw new Error("Could not read that photo");
      const { data, error } = await supabase.functions.invoke("homemade-recipe-scan", {
        body: { image: { data: b64, mime } },
      });
      if (error) throw error;
      const items = Array.isArray((data as { items?: unknown })?.items)
        ? (data as { items: Array<Record<string, unknown>> }).items
        : [];
      if (items.length === 0) {
        toast.error("Couldn't read a recipe there — try a clearer photo, or type it in");
        return;
      }
      const scanned: RowState[] = items.map((it) => {
        const amountText = String(it.amount_text ?? "").trim();
        return {
          ingredient: String(it.ingredient ?? "").trim(),
          qty: String(it.qty ?? "").trim(),
          unit: String(it.unit ?? "").trim() || (amountText ? "other" : ""),
          freeText: amountText,
        };
      });
      setRows((prev) => {
        const kept = prev.filter((r) => r.ingredient.trim().length > 0);
        return [...kept, ...scanned];
      });
      const scannedName = typeof (data as { name?: unknown })?.name === "string"
        ? String((data as { name: string }).name).trim()
        : "";
      if (scannedName && !name.trim()) setName(scannedName);
      setScanUsed(true);
      setScanPhoto(file);
      toast.success(`Added ${scanned.length} ingredient${scanned.length === 1 ? "" : "s"} — check them over`);
    } catch (e) {
      console.error("recipe scan failed", e);
      toast.error(e instanceof Error ? e.message : "Could not read that photo");
    } finally {
      setScanning(false);
      if (scanInputRef.current) scanInputRef.current.value = "";
    }
  };


  const filled = rows.filter((r) => r.ingredient.trim().length > 0);
  const canSave = name.trim().length > 1 && !!category && filled.length >= 1;

  /** Signals for "this is a shop-bought label, not a recipe" — prompt only. */
  const commercialSignals = detectCommercialLabel(
    filled.map((r) => ({
      ingredient: r.ingredient,
      amount: formatAmount(r.qty.trim(), r.unit, r.freeText),
    })),
  );

  // She taps Save; if the list reads as a manufactured ingredient panel she is
  // asked first, and nothing is reclassified without her answer.
  const onSavePressed = () => {
    if (commercialSignals.looksCommercial) { setCommercialPrompt(true); return; }
    void save(true);
  };

  const save = async (asHomemade: boolean) => {
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


      // She may skip the photo step entirely — in that case the recipe photo
      // she already scanned becomes the product image, so the shelf card and
      // product page are never blank when a photo does exist.
      const imageFile = photo ?? scanPhoto;
      let storagePath: string | null = null;
      if (imageFile) {
        try {
          const prepared = await prepareImageForAi(imageFile);
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
          is_homemade: asHomemade,
          homemade_recipe: (asHomemade ? recipe : null) as unknown as Json,
          // Kept in sync deliberately: every existing consumer reads this.
          ingredients: recipeIngredientNames(recipe),
          // Records HOW the list originated, so a misread scan can be told
          // apart from something she typed herself.
          ingredients_source: asHomemade
            ? (scanUsed ? "homemade_scan" : "homemade_manual")
            : (scanUsed ? "label_scan" : "manual"),

          storage_path: storagePath,
          on_shelf: true,
          added_to_shelf_at: new Date().toISOString(),
        }, { onConflict: "user_id,product_key" })
        .select("id")
        .single();
      if (error) throw error;

      toast.success(
        asHomemade ? "Recipe saved — analysing it now" : "Product saved — analysing it now",
      );
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
          much — pick a number and a unit, or choose "Other…" to describe it in
          your own words. Amounts are optional, but the analysis reads them.
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
          <div className="space-y-1.5">
            <Button
              variant="goldOutline"
              size="pill"
              className="w-full"
              disabled={scanning}
              onClick={() => scanInputRef.current?.click()}
            >
              <ScanLine className="size-4 mr-1.5" />
              {scanning ? "Reading your recipe…" : "Scan a written recipe"}
            </Button>
            <input
              ref={scanInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void scanRecipe(f);
              }}
            />
            <p className="text-[11px] text-muted-foreground leading-snug text-center">
              Photograph your notecard, jar label or notes screenshot — we'll fill
              the list in for you to check before you save.
            </p>
          </div>

          <div className="space-y-2.5">
            {rows.map((row, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1 space-y-1.5">
                  <Input
                    value={row.ingredient}
                    onChange={(e) => setRow(i, { ingredient: e.target.value })}
                    placeholder="Ingredient — e.g. shea butter"
                    maxLength={180}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      value={row.qty}
                      onChange={(e) =>
                        setRow(i, { qty: e.target.value.replace(/[^\d.,/]/g, "") })
                      }
                      inputMode="decimal"
                      placeholder="Amount"
                      aria-label="Amount"
                      maxLength={8}
                      disabled={row.unit === "other"}
                      className="w-[92px]"
                    />
                    <Select
                      value={row.unit}
                      onValueChange={(v) => setRow(i, { unit: v })}
                    >
                      <SelectTrigger className="flex-1" aria-label="Unit">
                        <SelectValue placeholder="Unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {RECIPE_UNITS.map((u) => (
                          <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {row.unit === "other" && (
                    <Input
                      value={row.freeText}
                      onChange={(e) => setRow(i, { freeText: e.target.value })}
                      placeholder="How much — e.g. a handful"
                      maxLength={40}
                    />
                  )}

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
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
          >
            <Plus className="size-4 mr-1.5" /> Add another ingredient
          </Button>
        </SurfaceCard>

        <SurfaceCard className="p-4 space-y-2">
          <SectionLabel>Photo (optional)</SectionLabel>
          <label className="flex items-center gap-2.5 text-[12.5px] text-foreground cursor-pointer min-h-[44px]">
            <Camera className="size-4 text-primary" />
            <span className="flex-1 truncate">
              {photo
                ? photo.name
                : scanPhoto
                  ? "Using your scanned recipe photo — tap to use a different one"
                  : "Add a photo of the mix or the jar"}
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
          onClick={onSavePressed}
        >
          {saving ? "Saving…" : "Save & analyse"}
        </Button>
      </div>

      <AlertDialog open={commercialPrompt} onOpenChange={setCommercialPrompt}>
        <AlertDialogContent className="max-w-[320px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[17px]">
              This looks like a store-bought product
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] leading-relaxed">
              {commercialSignals.preservatives.length > 0
                ? `The list includes ${commercialSignals.preservatives.join(", ")} and no measured amounts, which is how a manufactured ingredient panel reads rather than a recipe you mixed.`
                : `The list has ${commercialSignals.ingredientCount} ingredients and no measured amounts, which is how a manufactured ingredient panel reads rather than a recipe you mixed.`}
              {" "}Saving it as a regular product gives you the right analysis. Want to
              save it as a regular product instead?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              className="w-full"
              onClick={() => { setCommercialPrompt(false); void save(false); }}
            >
              Save as a regular product
            </AlertDialogAction>
            <AlertDialogCancel
              className="w-full mt-0"
              onClick={() => { setCommercialPrompt(false); void save(true); }}
            >
              No, it's my own recipe
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
  );
};

export default AddHomemadeProduct;
