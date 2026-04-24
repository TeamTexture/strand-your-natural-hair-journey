import { useRef, useState } from "react";
import { Camera, ImagePlus, Link2, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildAiContext } from "@/lib/aiContext";
import { prepareImageForAi } from "@/lib/imagePrep";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Friendly label for the wash step the product is being added to. */
  stepLabel: string;
  /** Called once the product has been saved to the user's shelf. */
  onAdded: (product: UserProduct) => void;
}

type Mode = "choose" | "link" | "uploading";

/**
 * Inline product picker for the wash-day flow. Lets the user add a product
 * (link / upload / camera) and analyse it WITHOUT navigating away from the
 * wash steps. Successfully analysed products are upserted to `user_products`
 * with `on_shelf: true` so they show up across the app immediately.
 */
const AddWashProductSheet = ({ open, onOpenChange, stepLabel, onAdded }: Props) => {
  const { user } = useAuth();
  const { upsert } = useUserProducts("all");
  const [mode, setMode] = useState<Mode>("choose");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setMode("choose");
    setUrl("");
    setBusy(false);
  };

  const close = () => {
    if (busy) return; // don't allow closing mid-analysis
    reset();
    onOpenChange(false);
  };

  // Shared "save analysis result onto the shelf" logic.
  const persistProduct = async (
    analysis: Record<string, unknown>,
    storage_path: string | null,
    image_url: string | null,
  ) => {
    const name = (analysis.product_name as string) || "Untitled product";
    const brand = (analysis.brand as string) || null;
    const product_key = `wash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const saved = await upsert({
      product_key,
      name,
      brand,
      category: (analysis.category as string) ?? null,
      ingredients: (analysis.ingredients as string[]) ?? [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      key_ingredients: (analysis.key_ingredients as any) ?? [],
      ai_summary: (analysis.ai_summary as string) ?? null,
      match_score: (analysis.match_score as number) ?? null,
      storage_path,
      image_url,
      on_shelf: true,
      added_to_shelf_at: new Date().toISOString(),
    });
    if (saved) {
      toast.success(`Added ${saved.name} to your shelf`);
      onAdded(saved);
      reset();
      onOpenChange(false);
    }
  };

  const submitLink = async () => {
    if (!user) { toast.error("Please sign in"); return; }
    let normalised = url.trim();
    if (!normalised) { toast.error("Paste a product link first"); return; }
    if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;
    try { new URL(normalised); } catch {
      toast.error("That doesn't look like a valid web link");
      return;
    }
    setBusy(true);
    try {
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke("product-analyse-url", {
        body: { url: normalised, context },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await persistProduct(data, null, (data?.image_url as string | undefined) ?? null);
    } catch (e) {
      console.error("link analyse failed", e);
      toast.error(e instanceof Error ? e.message : "Couldn't analyse that link");
    } finally {
      setBusy(false);
    }
  };

  const submitFile = async (raw: File | undefined) => {
    if (!raw || !user) return;
    if (!raw.type.startsWith("image/") && !/\.(heic|heif)$/i.test(raw.name)) {
      toast.error("Pick an image file");
      return;
    }
    if (raw.size > 15 * 1024 * 1024) {
      toast.error("Photo too large (max 15MB)");
      return;
    }
    setMode("uploading");
    setBusy(true);
    try {
      const prepared = await prepareImageForAi(raw);
      const path = `${user.id}/scans/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("product-photos")
        .upload(path, prepared.uploadFile, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke("product-analyse", {
        body: { image_url: prepared.dataUrl, context },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const { data: signed } = await supabase.storage
        .from("product-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      await persistProduct(data, path, signed?.signedUrl ?? null);
    } catch (e) {
      console.error("photo analyse failed", e);
      toast.error(e instanceof Error ? e.message : "Couldn't analyse that photo");
    } finally {
      setBusy(false);
      setMode("choose");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[92vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a product to {stepLabel}</DialogTitle>
          <DialogDescription>
            We'll save it to your shelf so it's ready next wash day too.
          </DialogDescription>
        </DialogHeader>

        {busy && (
          <div className="py-8 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p>Analysing the product…</p>
          </div>
        )}

        {!busy && mode === "choose" && (
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="w-full flex items-center gap-3 p-3.5 rounded-[12px] border border-border bg-card hover:bg-muted text-left transition-colors min-h-[56px]"
            >
              <span className="size-10 rounded-[10px] bg-primary/15 flex items-center justify-center shrink-0">
                <Camera className="size-5 text-primary" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">Take a photo</span>
                <span className="block text-[11px] text-muted-foreground">Snap the bottle's front + ingredients</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-3 p-3.5 rounded-[12px] border border-border bg-card hover:bg-muted text-left transition-colors min-h-[56px]"
            >
              <span className="size-10 rounded-[10px] bg-primary/15 flex items-center justify-center shrink-0">
                <ImagePlus className="size-5 text-primary" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">Upload a photo</span>
                <span className="block text-[11px] text-muted-foreground">From your camera roll</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode("link")}
              className="w-full flex items-center gap-3 p-3.5 rounded-[12px] border border-border bg-card hover:bg-muted text-left transition-colors min-h-[56px]"
            >
              <span className="size-10 rounded-[10px] bg-primary/15 flex items-center justify-center shrink-0">
                <Link2 className="size-5 text-primary" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">Paste a link</span>
                <span className="block text-[11px] text-muted-foreground">From a product page or shop</span>
              </span>
            </button>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*,.heic,.heif"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                void submitFile(f);
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                void submitFile(f);
              }}
            />
          </div>
        )}

        {!busy && mode === "link" && (
          <div className="space-y-3 pt-1">
            <Input
              autoFocus
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submitLink(); }}
            />
            <div className="flex gap-2">
              <Button variant="outline" size="pill" onClick={() => setMode("choose")} className="flex-1">
                ← Back
              </Button>
              <Button variant="gold" size="pill" onClick={submitLink} className="flex-1">
                Analyse link
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddWashProductSheet;
