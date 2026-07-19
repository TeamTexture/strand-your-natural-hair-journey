// Upload a blood test PDF or photo — AI extracts marker values, user reviews
// and confirms, then saves as a new blood panel + results.
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, ImageIcon, Loader2, Check, X, Lock } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BLOOD_RANGES, evaluate } from "@/data/bloodRanges";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { detectPdfEncrypted, renderPdfToImage, PdfPasswordRequiredError } from "@/lib/pdfUnlock";

interface ExtractedRow {
  marker: string;
  value: number;
  unit: string;
  unit_reported: string;
  raw_marker: string;
  raw_value: string;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  }
  return btoa(binary);
}

export default function BloodUpload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [rows, setRows] = useState<ExtractedRow[]>([]);
  const [panelDate, setPanelDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [dragOver, setDragOver] = useState(false);

  // Password dialog state for encrypted PDFs
  const [pwOpen, setPwOpen] = useState(false);
  const [pwValue, setPwValue] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwUnlocking, setPwUnlocking] = useState(false);
  const [pendingBytes, setPendingBytes] = useState<Uint8Array | null>(null);
  const [pendingName, setPendingName] = useState<string>("");

  const pick = () => inputRef.current?.click();

  const runExtract = useCallback(async (payloadFile: File) => {
    setExtracting(true);
    try {
      const b64 = await fileToBase64(payloadFile);
      const { data, error } = await supabase.functions.invoke("blood-extract", {
        body: { file: { data: b64, mime: payloadFile.type || "application/pdf", name: payloadFile.name } },
      });
      if (error) throw error;
      const results = (data?.results ?? []) as ExtractedRow[];
      if (data?.panel_date) setPanelDate(data.panel_date);
      setRows(results);
      const initialChecked: Record<string, boolean> = {};
      results.forEach((r) => { initialChecked[r.marker] = true; });
      setChecked(initialChecked);
      if (results.length === 0) {
        toast.error("No markers found. Try a clearer photo or the PDF from your lab.");
      } else {
        toast.success(`Found ${results.length} marker${results.length === 1 ? "" : "s"}`);
      }
    } catch (err) {
      console.error("blood-extract failed:", err);
      toast.error("Couldn't read that file. Try again with a clearer photo or PDF.");
    } finally {
      setExtracting(false);
    }
  }, []);

  const onFile = useCallback(async (f: File | null) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) {
      toast.error("File is too large. Please upload under 15 MB.");
      return;
    }
    setFile(f);
    setRows([]);
    setChecked({});

    // PDFs: always convert to an image before sending. The AI gateway's
    // Gemini path doesn't accept raw PDF file parts, so we render the first
    // few pages client-side and send as JPEG. If the PDF is encrypted, prompt
    // for the password first.
    if (f.type === "application/pdf") {
      const buf = new Uint8Array(await f.arrayBuffer());
      if (detectPdfEncrypted(buf)) {
        setPendingBytes(buf);
        setPendingName(f.name);
        setPwValue("");
        setPwError(null);
        setPwOpen(true);
        return;
      }
      try {
        setExtracting(true);
        const image = await renderPdfToImage(buf, "", { maxPages: 6 });
        const shown = new File(
          [image],
          f.name.replace(/\.pdf$/i, "") + ".jpg",
          { type: "image/jpeg" },
        );
        setFile(shown);
        setExtracting(false);
        await runExtract(image);
      } catch (err) {
        setExtracting(false);
        console.error("pdf render failed:", err);
        toast.error("Couldn't open that PDF. Try a photo or a different file.");
      }
      return;
    }
    await runExtract(f);
  }, [runExtract]);

  const submitPassword = async () => {
    if (!pendingBytes) return;
    setPwUnlocking(true);
    setPwError(null);
    try {
      const image = await renderPdfToImage(pendingBytes, pwValue, { maxPages: 6 });
      setPwOpen(false);
      setPendingBytes(null);
      // Swap the shown file to the unlocked image so downstream flow works
      const shown = new File([image], pendingName.replace(/\.pdf$/i, "") + " (unlocked).jpg", { type: "image/jpeg" });
      setFile(shown);
      await runExtract(image);
    } catch (err) {
      if (err instanceof PdfPasswordRequiredError) {
        setPwError(err.incorrect ? "Incorrect password — try again." : "Password required.");
      } else {
        console.error("pdf unlock failed:", err);
        setPwError("Couldn't unlock this PDF. Please check the password.");
      }
    } finally {
      setPwUnlocking(false);
    }
  };

  const cancelPassword = () => {
    setPwOpen(false);
    setPendingBytes(null);
    setPendingName("");
    setPwValue("");
    setPwError(null);
    setFile(null);
  };

  const toggle = (marker: string) =>
    setChecked((p) => ({ ...p, [marker]: !p[marker] }));

  const updateValue = (marker: string, value: string) =>
    setRows((prev) =>
      prev.map((r) =>
        r.marker === marker ? { ...r, value: Number(value) } : r,
      ),
    );

  const selectedCount = useMemo(
    () => rows.filter((r) => checked[r.marker]).length,
    [rows, checked],
  );

  const save = async () => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }
    const chosen = rows.filter((r) => checked[r.marker] && Number.isFinite(r.value));
    if (chosen.length === 0) {
      toast.error("Select at least one marker to save");
      return;
    }
    setSaving(true);
    try {
      // Create a new panel row
      const { data: panel, error: panelErr } = await supabase
        .from("blood_panels" as never)
        .insert({
          user_id: user.id,
          panel_date: panelDate,
          status: "logged",
          label: file?.name?.slice(0, 60) ?? null,
        } as never)
        .select("id")
        .single();
      if (panelErr || !panel) throw panelErr ?? new Error("panel insert failed");
      const panelId = (panel as { id: string }).id;

      const resultRows = chosen.map((r) => {
        const ref = BLOOD_RANGES[r.marker];
        return {
          user_id: user.id,
          panel_id: panelId,
          marker: r.marker,
          value: r.value,
          unit: ref?.unit ?? r.unit,
          category: ref?.category ?? null,
          status: evaluate(r.marker, r.value),
        };
      });

      const { error: resErr } = await supabase
        .from("blood_results")
        .insert(resultRows as never);
      if (resErr) throw resErr;

      toast.success(`Saved ${chosen.length} marker${chosen.length === 1 ? "" : "s"}`);
      navigate("/blood-history");
    } catch (err) {
      console.error("save failed:", err);
      toast.error("Couldn't save results. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="Upload blood test" onBack={() => navigate("/blood-history")} />
      <div className="px-5 pt-2 pb-10 space-y-4">
        <p className="text-sm text-foreground/80 font-body leading-relaxed">
          Upload a PDF or photo of your lab report. STRAND will read the results
          and pre-fill your panel — check them, then save.
        </p>

        {!file && (
          <SurfaceCard>
            <button
              onClick={pick}
              className="w-full flex flex-col items-center justify-center gap-3 py-8 rounded-xl border-2 border-dashed border-primary/40 hover:border-primary/70 transition"
            >
              <Upload className="size-8 text-primary" />
              <div className="text-center">
                <p className="font-display text-lg">Upload results</p>
                <p className="text-xs text-foreground/60 font-body">
                  PDF or photo · up to 15 MB
                </p>
              </div>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </SurfaceCard>
        )}

        {file && (
          <SurfaceCard>
            <div className="flex items-center gap-3">
              {file.type === "application/pdf" ? (
                <FileText className="size-6 text-primary shrink-0" />
              ) : (
                <ImageIcon className="size-6 text-primary shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-body font-medium truncate">{file.name}</p>
                <p className="text-xs text-foreground/60 font-body">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <button
                onClick={() => {
                  setFile(null);
                  setRows([]);
                  setChecked({});
                }}
                className="size-8 rounded-full hover:bg-muted flex items-center justify-center"
                aria-label="Remove file"
              >
                <X className="size-4" />
              </button>
            </div>
          </SurfaceCard>
        )}

        {extracting && (
          <SurfaceCard>
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="size-5 animate-spin text-primary" />
              <p className="text-sm font-body">Reading your results…</p>
            </div>
          </SurfaceCard>
        )}

        {rows.length > 0 && (
          <>
            <SurfaceCard>
              <Label htmlFor="panel-date" className="text-xs font-body text-foreground/70">
                Test date
              </Label>
              <Input
                id="panel-date"
                type="date"
                value={panelDate}
                onChange={(e) => setPanelDate(e.target.value)}
                className="mt-1"
              />
            </SurfaceCard>

            <SurfaceCard>
              <div className="flex items-center justify-between mb-3">
                <p className="font-display text-lg">Review markers</p>
                <p className="text-xs text-foreground/60 font-body">
                  {selectedCount} of {rows.length} selected
                </p>
              </div>
              <div className="space-y-2">
                {rows.map((r) => {
                  const ref = BLOOD_RANGES[r.marker];
                  const status = evaluate(r.marker, r.value);
                  const isChecked = !!checked[r.marker];
                  return (
                    <div
                      key={r.marker}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border transition",
                        isChecked ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30",
                      )}
                    >
                      <button
                        onClick={() => toggle(r.marker)}
                        className={cn(
                          "size-6 rounded-full flex items-center justify-center border transition shrink-0",
                          isChecked ? "bg-primary border-primary" : "border-border bg-background",
                        )}
                        aria-label={isChecked ? "Deselect" : "Select"}
                      >
                        {isChecked && <Check className="size-4 text-primary-foreground" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-body font-medium truncate">{r.marker}</p>
                        <p className="text-[11px] text-foreground/60 font-body truncate">
                          As read: {r.raw_marker} · {r.raw_value}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Input
                          type="number"
                          step="0.01"
                          value={Number.isFinite(r.value) ? r.value : ""}
                          onChange={(e) => updateValue(r.marker, e.target.value)}
                          className="h-8 w-20 text-right text-sm"
                        />
                        <span className="text-[11px] text-foreground/60 font-body w-14">
                          {ref?.unit ?? r.unit}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-body font-medium uppercase tracking-wide shrink-0",
                          status === "low" && "bg-warn/20 text-warn",
                          status === "high" && "bg-alert-dark/20 text-alert-dark",
                          status === "normal" && "bg-good/20 text-good",
                          status === "untested" && "bg-muted text-foreground/60",
                        )}
                      >
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </SurfaceCard>

            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={save}
              disabled={saving || selectedCount === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                `Save ${selectedCount} marker${selectedCount === 1 ? "" : "s"}`
              )}
            </Button>
          </>
        )}
      </div>

      <Dialog open={pwOpen} onOpenChange={(v) => { if (!v) cancelPassword(); }}>
        <DialogContent className="max-w-[340px]">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Lock className="size-4 text-primary" /> Password-protected PDF
            </DialogTitle>
            <DialogDescription className="font-body text-xs">
              This lab report is locked. Enter the password from your lab email so STRAND can read your results.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pdf-pw" className="text-xs font-body">Password</Label>
            <Input
              id="pdf-pw"
              type="password"
              autoFocus
              value={pwValue}
              onChange={(e) => { setPwValue(e.target.value); setPwError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") submitPassword(); }}
              disabled={pwUnlocking}
            />
            {pwError && <p className="text-xs text-alert-dark font-body">{pwError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="pill" onClick={cancelPassword} disabled={pwUnlocking}>
              Cancel
            </Button>
            <Button variant="gold" size="pill" onClick={submitPassword} disabled={pwUnlocking || !pwValue}>
              {pwUnlocking ? (<><Loader2 className="size-4 animate-spin" /> Unlocking…</>) : "Unlock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenLayout>
  );
}
