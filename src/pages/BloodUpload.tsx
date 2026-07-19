// Upload a blood test PDF or photo — AI extracts marker values, user reviews
// and confirms, then saves as a new blood panel + results.
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, ImageIcon, Loader2, Check, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BLOOD_RANGES, evaluate } from "@/data/bloodRanges";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

  const pick = () => inputRef.current?.click();

  const onFile = useCallback(async (f: File | null) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) {
      toast.error("File is too large. Please upload under 15 MB.");
      return;
    }
    setFile(f);
    setRows([]);
    setChecked({});
    setExtracting(true);
    try {
      const b64 = await fileToBase64(f);
      const { data, error } = await supabase.functions.invoke("blood-extract", {
        body: { file: { data: b64, mime: f.type || "application/pdf", name: f.name } },
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
    </ScreenLayout>
  );
}
