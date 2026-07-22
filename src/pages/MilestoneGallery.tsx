// Milestone photo gallery — 6-week progress check-ins.
// Reachable from Profile and from the home alert ("Time for your 6-week photos").

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Plus, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import ItalicSub from "@/components/ItalicSub";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePhotoUploader } from "@/hooks/usePhotoUploader";
import { toast } from "sonner";

interface Row {
  id: string;
  storage_path: string;
  caption: string | null;
  taken_on: string;
  url: string;
}

const fmt = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
};

const MilestoneGallery = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { upload, sign, uploading } = usePhotoUploader("milestone-photos");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("user_milestone_photos")
      .select("id, storage_path, caption, taken_on")
      .eq("user_id", user.id)
      .order("taken_on", { ascending: false });
    const base = (data ?? []) as Omit<Row, "url">[];
    const withUrls: Row[] = [];
    for (const r of base) {
      const u = await sign(r.storage_path);
      if (u) withUrls.push({ ...r, url: u });
    }
    setRows(withUrls);
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  const handlePick = async (file: File | null) => {
    if (!file || !user) return;
    const path = await upload(file);
    if (!path) { toast.error("Upload failed"); return; }
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("user_milestone_photos")
      .insert({ user_id: user.id, storage_path: path, taken_on: today });
    if (error) {
      console.error(error);
      toast.error("Could not save");
      return;
    }
    toast.success("Milestone photo added");
    await load();
  };

  const removeRow = async (r: Row) => {
    if (!user) return;
    await supabase.from("user_milestone_photos").delete().eq("id", r.id);
    await supabase.storage.from("milestone-photos").remove([r.storage_path]);
    setRows((prev) => prev.filter((x) => x.id !== r.id));
  };

  const daysSinceLast = rows[0]
    ? Math.floor((Date.now() - new Date(rows[0].taken_on).getTime()) / 86_400_000)
    : null;

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Progress Photos" onBack={smartBack(navigate, "/profile")} />
      <ItalicSub>
        A 6-week cadence is enough to see real change without obsessing day to day.
      </ItalicSub>

      <div className="px-5 pb-6 space-y-4">
        <SurfaceCard tone="gold">
          {daysSinceLast === null ? (
            <p className="text-sm">
              <span className="font-semibold">📸 Start your progress timeline.</span>{" "}
              <span className="text-muted-foreground">Your first milestone photo becomes the baseline.</span>
            </p>
          ) : daysSinceLast >= 42 ? (
            <p className="text-sm">
              <span className="font-semibold">⏰ It's been {daysSinceLast} days.</span>{" "}
              <span className="text-muted-foreground">Time for your next 6-week progress photo.</span>
            </p>
          ) : (
            <p className="text-sm">
              <span className="font-semibold">✅ {daysSinceLast} days in.</span>{" "}
              <span className="text-muted-foreground">
                Next photo recommended in {Math.max(0, 42 - daysSinceLast)} days.
              </span>
            </p>
          )}
        </SurfaceCard>

        <Button
          variant="gold"
          size="pill"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : (
            <span className="inline-flex items-center gap-1.5">
              {rows.length === 0 ? <Camera className="size-4" /> : <Plus className="size-4" />}
              {rows.length === 0 ? "Add baseline photo" : "Add new milestone"}
            </span>
          )}
        </Button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            void handlePick(f ?? null);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />

        {loading ? (
          <LoadingDot label="Loading photos…" fullScreen={false} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="📷"
            message="No milestone photos yet"
            hint="Tap above to capture your baseline."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {rows.map((r) => (
              <div key={r.id} className="space-y-1.5">
                <div className="relative aspect-square rounded-[14px] overflow-hidden bg-muted">
                  <img src={r.url} alt={`Milestone ${r.taken_on}`} className="absolute inset-0 size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeRow(r)}
                    aria-label="Delete photo"
                    className="absolute top-1.5 right-1.5 size-7 rounded-full bg-background/85 backdrop-blur flex items-center justify-center text-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground text-center">{fmt(r.taken_on)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default MilestoneGallery;
