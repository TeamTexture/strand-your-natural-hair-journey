// Upload a blood test PDF or photo — AI extracts marker values, user reviews
// and confirms, then saves as a new blood panel + results.
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, ImageIcon, Loader2, X, Lock, Eye, EyeOff } from "lucide-react";
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
import {
  clearBloodDraft,
  setDraftPanelDate,
  setUnknownMarkers,
  type UnknownMarker,
} from "@/hooks/useBloodValues";
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
  const [files, setFiles] = useState<File[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [rows, setRows] = useState<ExtractedRow[]>([]);
  const [panelDate, setPanelDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Password dialog state for encrypted PDFs
  const [pwOpen, setPwOpen] = useState(false);
  const [pwValue, setPwValue] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwUnlocking, setPwUnlocking] = useState(false);
  const [pwVisible, setPwVisible] = useState(false);
  const [pendingBytes, setPendingBytes] = useState<Uint8Array | null>(null);
  const [pendingName, setPendingName] = useState<string>("");


  const pick = () => inputRef.current?.click();

  const runExtract = useCallback(async (payloadFiles: File[]) => {
    setExtracting(true);
    try {
      const encoded = await Promise.all(
        payloadFiles.map(async (f) => ({
          data: await fileToBase64(f),
          mime: f.type || "application/octet-stream",
          name: f.name,
        })),
      );
      const { data, error } = await supabase.functions.invoke("blood-extract", {
        body: { files: encoded },
      });
      if (error) throw error;
      const results = (data?.results ?? []) as ExtractedRow[];
      if (data?.panel_date) setPanelDate(data.panel_date);
      setRows(results);

      if (results.length === 0) {
        toast.error("No markers found. Try clearer photos or the PDF from your lab.");
      } else {
        toast.success(`Found ${results.length} marker${results.length === 1 ? "" : "s"}`);
      }
    } catch (err) {
      console.error("blood-extract failed:", err);
      toast.error("Couldn't read that file. Try again with clearer photos or a PDF.");
    } finally {
      setExtracting(false);
    }
  }, []);

  const onFiles = useCallback(async (list: FileList | File[] | null) => {
    if (!list) return;
    const arr = Array.from(list);
    if (arr.length === 0) return;

    const pdfs = arr.filter((f) => f.type === "application/pdf");
    const imgs = arr.filter((f) => f.type.startsWith("image/"));
    const other = arr.filter((f) => !pdfs.includes(f) && !imgs.includes(f));
    if (other.length > 0) {
      toast.error("Only PDF or image files are supported.");
      return;
    }
    if (pdfs.length > 1) {
      toast.error("You can upload 1 PDF at a time.");
      return;
    }
    if (pdfs.length === 1 && imgs.length > 0) {
      toast.error("Upload either 1 PDF or photos — not both.");
      return;
    }
    if (imgs.length > 10) {
      toast.error("Up to 10 photos allowed.");
      return;
    }
    const tooBig = arr.find((f) => f.size > 15 * 1024 * 1024);
    if (tooBig) {
      toast.error(`"${tooBig.name}" is over 15 MB. Please choose a smaller file.`);
      return;
    }

    setRows([]);



    // Single PDF path — render to images client-side (gateway won't accept raw PDFs).
    if (pdfs.length === 1) {
      const pdf = pdfs[0];
      setFiles([pdf]);
      const buf = new Uint8Array(await pdf.arrayBuffer());
      try {
        setExtracting(true);
        const image = await renderPdfToImage(buf, "", { maxPages: 6 });
        const shown = new File(
          [image],
          pdf.name.replace(/\.pdf$/i, "") + ".jpg",
          { type: "image/jpeg" },
        );
        setFiles([shown]);
        setExtracting(false);
        await runExtract([image]);
      } catch (err) {
        setExtracting(false);
        if (err instanceof PdfPasswordRequiredError) {
          setPendingBytes(buf);
          setPendingName(pdf.name);
          setPwValue("");
          setPwError(null);
          setPwOpen(true);
          return;
        }
        console.error("pdf render failed:", err);
        toast.error("Couldn't open that PDF. Try photos instead.");
      }
      return;
    }

    // Photos path — up to 10.
    setFiles(imgs);
    await runExtract(imgs);
  }, [runExtract]);

  const submitPassword = async () => {
    if (!pendingBytes) return;
    setPwUnlocking(true);
    setPwError(null);
    try {
      const image = await renderPdfToImage(pendingBytes, pwValue, { maxPages: 6 });
      setPwOpen(false);
      setPendingBytes(null);
      const shown = new File([image], pendingName.replace(/\.pdf$/i, "") + " (unlocked).jpg", { type: "image/jpeg" });
      setFiles([shown]);
      await runExtract([image]);
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
    setFiles([]);
  };


  const updateValue = (marker: string, value: string) =>
    setRows((prev) =>
      prev.map((r) =>
        r.marker === marker ? { ...r, value: Number(value) } : r,
      ),
    );

  const removeRow = (marker: string) =>
    setRows((prev) => prev.filter((r) => r.marker !== marker));

  // Split extracted rows into markers STRAND tracks (matched to BLOOD_RANGES)
  // vs "other" markers the report contained but we don't have a reference range
  // for. Both get saved — the tracked ones drive the categorized review pages,
  // and the "other" ones show up on the last page so nothing is lost.
  const known = useMemo(
    () => rows.filter((r) => BLOOD_RANGES[r.marker]),
    [rows],
  );
  const unknown = useMemo(
    () => rows.filter((r) => !BLOOD_RANGES[r.marker]),
    [rows],
  );

  const grouped = useMemo(() => {
    const g: Record<string, ExtractedRow[]> = {
      iron: [], vitamins: [], minerals: [], inflammation: [], thyroid: [], hormones: [],
    };
    known.forEach((r) => {
      const cat = BLOOD_RANGES[r.marker]?.category;
      if (cat && g[cat]) g[cat].push(r);
    });
    return g;
  }, [known]);

  const CATEGORY_LABELS: Record<string, string> = {
    iron: "Iron & Storage",
    vitamins: "Vitamins",
    minerals: "Minerals",
    inflammation: "Inflammation & General",
    thyroid: "Thyroid",
    hormones: "Hormones",
  };

  const continueToReview = async () => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }
    const usable = rows.filter((r) => Number.isFinite(r.value));
    if (usable.length === 0) {
      toast.error("No valid values to review yet.");
      return;
    }
    setSaving(true);
    try {
      // Start a fresh draft so we don't overwrite a prior in-progress panel.
      clearBloodDraft();
      setDraftPanelDate(panelDate);

      // Hydrate the known-marker cache the onboarding pages read from.
      const values: Record<string, number> = {};
      known.forEach((r) => {
        if (Number.isFinite(r.value)) values[r.marker] = r.value;
      });
      localStorage.setItem("strand_blood_values", JSON.stringify(values));

      // Stash unknown markers so the last onboarding step can display them.
      const unknownList: UnknownMarker[] = unknown
        .filter((r) => Number.isFinite(r.value))
        .map((r) => ({ marker: r.marker, value: r.value, unit: r.unit || "" }));
      setUnknownMarkers(unknownList);

      window.dispatchEvent(new Event("strand:blood-update"));
      navigate("/onboarding/blood-iron-vitamins");
    } catch (err) {
      console.error("hydrate failed:", err);
      toast.error("Couldn't open review. Please try again.");
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

        {files.length === 0 && (
          <SurfaceCard>
            <div
              onClick={pick}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onFiles(e.dataTransfer.files);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") pick(); }}
              className={cn(
                "w-full flex flex-col items-center justify-center gap-3 py-8 rounded-xl border-2 border-dashed cursor-pointer transition",
                dragOver
                  ? "border-primary bg-primary/10"
                  : "border-primary/40 hover:border-primary/70",
              )}
            >
              <Upload className={cn("size-8 text-primary transition", dragOver && "scale-110")} />
              <div className="text-center">
                <p className="font-display text-lg">
                  {dragOver ? "Drop to upload" : "Upload results"}
                </p>
                <p className="text-xs text-foreground/60 font-body">
                  Drag & drop, or tap to choose · 1 PDF or up to 10 photos · max 15 MB each
                </p>
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
          </SurfaceCard>
        )}


        {files.length > 0 && (
          <SurfaceCard>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-foreground/60 font-body">
                {files.length === 1 ? "1 file" : `${files.length} photos`}
              </p>
              <button
                onClick={() => {
                  setFiles([]);
                  setRows([]);
                }}
                className="text-xs text-foreground/60 hover:text-foreground font-body underline"
              >
                Remove all
              </button>

            </div>
            <div className="space-y-2">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center gap-3">
                  {f.type === "application/pdf" ? (
                    <FileText className="size-6 text-primary shrink-0" />
                  ) : (
                    <ImageIcon className="size-6 text-primary shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body font-medium truncate">{f.name}</p>
                    <p className="text-xs text-foreground/60 font-body">
                      {(f.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  {files.length > 1 && (
                    <button
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="size-8 rounded-full hover:bg-muted flex items-center justify-center"
                      aria-label="Remove file"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
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
              <p className="font-display text-lg mb-1">We found {rows.length} marker{rows.length === 1 ? "" : "s"}</p>
              <p className="text-xs text-foreground/60 font-body">
                {known.length} matched to STRAND's panel · {unknown.length} extra
                marker{unknown.length === 1 ? "" : "s"} we'll save alongside.
                Tap Continue to walk through each category and confirm the values.
              </p>
            </SurfaceCard>

            {(["iron", "vitamins", "minerals", "inflammation", "thyroid", "hormones"] as const).map((cat) => {
              const list = grouped[cat];
              if (!list || list.length === 0) return null;
              return (
                <SurfaceCard key={cat}>
                  <p className="font-display text-base mb-2">{CATEGORY_LABELS[cat]}</p>
                  <div className="space-y-2">
                    {list.map((r) => {
                      const ref = BLOOD_RANGES[r.marker];
                      const status = evaluate(r.marker, r.value);
                      return (
                        <div
                          key={r.marker}
                          className="flex items-center gap-3 p-2.5 rounded-xl border border-primary/25 bg-primary/5"
                        >
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
              );
            })}

            {unknown.length > 0 && (
              <SurfaceCard>
                <p className="font-display text-base mb-1">Other markers from your report</p>
                <p className="text-[11px] text-foreground/60 font-body mb-2">
                  These aren't tracked with a reference range in STRAND, but they'll
                  be saved with your panel for your records.
                </p>
                <div className="space-y-2">
                  {unknown.map((r) => (
                    <div
                      key={r.marker}
                      className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/30"
                    >
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
                          {r.unit || "—"}
                        </span>
                      </div>
                      <button
                        onClick={() => removeRow(r.marker)}
                        className="size-7 rounded-full hover:bg-muted flex items-center justify-center shrink-0"
                        aria-label="Remove marker"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            )}

            <Button
              variant="gold"
              size="pill"
              className="w-full"
              onClick={continueToReview}
              disabled={saving || rows.length === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Opening review…
                </>
              ) : (
                `Continue — review by category →`
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
            <div className="relative">
              <Input
                id="pdf-pw"
                type={pwVisible ? "text" : "password"}
                autoFocus
                value={pwValue}
                onChange={(e) => { setPwValue(e.target.value); setPwError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") submitPassword(); }}
                disabled={pwUnlocking}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setPwVisible((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-foreground/60 hover:text-foreground"
                aria-label={pwVisible ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {pwVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
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
