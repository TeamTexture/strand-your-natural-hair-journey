import { useState } from "react";
import { Camera, Link2, Type, X, Loader2, Pill } from "lucide-react";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import FilePickerButton from "@/components/FilePickerButton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import SupplementPicker, { type SelectedSupplement } from "@/components/SupplementPicker";
import { useSupplements } from "@/hooks/useSupplements";
import { aiInvoke, isAuthInvokeError } from "@/lib/aiInvoke";
import { convertHeicToJpeg } from "@/lib/imagePrep";

interface Extracted {
  name?: string;
  dose?: string | null;
  frequency?: string | null;
  source_url?: string | null;
  error?: string;
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that photo"));
    reader.readAsDataURL(file);
  });

/**
 * "Your supplements" — what the member is currently taking. Sits above the
 * AI-recommended cards on the Nutrition plan's Supps tab. Three ways in:
 * a photo of the bottle, a pasted product link, or by name.
 */
const MySupplementsSection = () => {
  const { supplements, add, remove, isLoading } = useSupplements();
  const [busy, setBusy] = useState<null | "photo" | "link">(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<SelectedSupplement[]>([]);

  const ingest = async (
    body: { image_data_url?: string; url?: string },
    source: "photo" | "link",
  ) => {
    setBusy(source);
    try {
      const { data, error } = await aiInvoke<Extracted>("supplement-extract", body);
      if (error) {
        const msg = (error as { message?: string }).message ?? "";
        if (isAuthInvokeError(error)) toast.error("Your session timed out — refresh and try again.");
        else if (msg.includes("429")) toast.error("Try again in a moment.");
        else toast.error("Couldn't read that. Try adding it by name.");
        return;
      }
      if (!data?.name) {
        toast.error(data?.error ?? "Couldn't tell which supplement that is. Try adding it by name.");
        return;
      }
      await add.mutateAsync({
        name: data.name,
        dose: data.dose ?? null,
        frequency: data.frequency ?? null,
        source,
        source_url: data.source_url ?? (body.url ?? null),
      });
      toast.success(`Added ${data.name}`);
      setLinkOpen(false);
      setUrl("");
    } catch (e) {
      console.error("supplement ingest failed", e);
      toast.error("Couldn't add that supplement. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const onPhoto = async (file: File) => {
    try {
      const prepared = await convertHeicToJpeg(file).catch(() => file);
      const dataUrl = await fileToDataUrl(prepared);
      await ingest({ image_data_url: dataUrl }, "photo");
    } catch (e) {
      console.error("supplement photo failed", e);
      toast.error("Couldn't read that photo.");
    }
  };

  const onLink = async () => {
    let normalised = url.trim();
    if (!normalised) {
      toast.error("Paste a supplement link first");
      return;
    }
    if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;
    try {
      new URL(normalised);
    } catch {
      toast.error("That doesn't look like a valid web link.");
      return;
    }
    await ingest({ url: normalised }, "link");
  };

  const saveNames = async () => {
    const existing = new Set(supplements.map((s) => s.name.toLowerCase()));
    const fresh = draft.filter((d) => !existing.has(d.name.toLowerCase()));
    if (fresh.length === 0) {
      setNameOpen(false);
      return;
    }
    try {
      for (const d of fresh) {
        await add.mutateAsync({ name: d.name, source: "manual" });
      }
      toast.success(fresh.length === 1 ? "Supplement added" : "Supplements added");
      setDraft([]);
      setNameOpen(false);
    } catch (e) {
      console.error("supplement manual add failed", e);
      toast.error("Couldn't save those. Please try again.");
    }
  };

  return (
    <div className="space-y-3">
      <SurfaceCard>
        <div className="flex items-start gap-2.5">
          <div className="size-8 rounded-full bg-primary/12 flex items-center justify-center shrink-0">
            <Pill className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-[17px] leading-tight text-foreground">
              Your supplements
            </p>
            <p className="text-[11px] font-body text-muted-foreground leading-relaxed mt-0.5">
              What you're already taking. We use this so your plan fills the gaps.
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <FilePickerButton
            onPick={onPhoto}
            preferCamera
            variant="outline"
            className="h-auto py-2.5 rounded-[12px]"
            disabled={busy !== null}
          >
            {busy === "photo" ? (
              <Loader2 className="size-4 mb-1 animate-spin" />
            ) : (
              <Camera className="size-4 mb-1" />
            )}
            <span className="text-[11px] font-semibold">Photo</span>
          </FilePickerButton>
          <Button
            variant="outline"
            className="h-auto py-2.5 rounded-[12px] flex-col"
            disabled={busy !== null}
            onClick={() => setLinkOpen(true)}
          >
            <Link2 className="size-4 mb-1" />
            <span className="text-[11px] font-semibold">Paste link</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto py-2.5 rounded-[12px] flex-col"
            disabled={busy !== null}
            onClick={() => {
              setDraft([]);
              setNameOpen(true);
            }}
          >
            <Type className="size-4 mb-1" />
            <span className="text-[11px] font-semibold">By name</span>
          </Button>
        </div>

        <div className="mt-3">
          {isLoading ? (
            <p className="text-[11px] font-body text-muted-foreground">Loading…</p>
          ) : supplements.length === 0 ? (
            <p className="text-[11px] font-body text-muted-foreground leading-relaxed">
              Nothing added yet. Snap a bottle, paste a link, or add one by name.
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {supplements.map((s) => {
                const detail = [s.dose, s.frequency].filter(Boolean).join(" · ");
                return (
                  <li key={s.id} className="py-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-body text-foreground break-words [overflow-wrap:anywhere]">
                        {s.name}
                      </p>
                      {detail && (
                        <p className="text-[11px] font-body text-muted-foreground break-words">
                          {detail}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove.mutateAsync(s.id)}
                      aria-label={`Remove ${s.name}`}
                      className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition shrink-0"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SurfaceCard>

      <Sheet open={linkOpen} onOpenChange={(v) => (busy ? null : setLinkOpen(v))}>
        <SheetContent side="bottom" className="rounded-t-[20px] px-5 pb-7 pt-5">
          <SheetHeader className="text-left space-y-1">
            <SheetTitle className="font-display text-[19px]">Paste a supplement link</SheetTitle>
            <SheetDescription className="text-xs font-body">
              We'll read the name and dose from the page.
            </SheetDescription>
          </SheetHeader>
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="mt-4 w-full px-3.5 py-3 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60"
          />
          <Button
            variant="gold"
            size="pill"
            className="w-full mt-4"
            disabled={busy !== null}
            onClick={() => void onLink()}
          >
            {busy === "link" ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" /> Reading the page…
              </>
            ) : (
              "Add supplement"
            )}
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet open={nameOpen} onOpenChange={setNameOpen}>
        <SheetContent side="bottom" className="rounded-t-[20px] px-5 pb-7 pt-5">
          <SheetHeader className="text-left space-y-1">
            <SheetTitle className="font-display text-[19px]">Add by name</SheetTitle>
            <SheetDescription className="text-xs font-body">
              Search the list, or type anything that isn't there.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <SupplementPicker value={draft} onChange={setDraft} label="Add" />
          </div>
          <Button
            variant="gold"
            size="pill"
            className="w-full mt-4"
            disabled={draft.length === 0 || add.isPending}
            onClick={() => void saveNames()}
          >
            {add.isPending ? "Saving…" : "Save"}
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MySupplementsSection;
