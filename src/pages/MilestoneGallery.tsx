// Milestone photo gallery — 6-week progress check-ins.
// Reachable from Profile and from the home alert ("Time for your 6-week photos").

import { smartBack } from "@/lib/smartBack";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useStyleCardPhoto } from "@/hooks/useStyleCardPhoto";
import MainPhotoPicker from "@/components/style/MainPhotoPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePhotoUploader } from "@/hooks/usePhotoUploader";
import { toast } from "sonner";
import { useGoals } from "@/hooks/useGoals";
import GoalsChallengesCard from "@/components/GoalsChallengesCard";
import LevelGate from "@/components/tips/LevelGate";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { wantsBeginner } from "@/lib/tipsRender";

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
  const { goal } = useGoals();
  const { level } = useTipsLevel();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const {
    mainPhotoId,
    setMainPhoto,
    refresh: refreshCardPhoto,
  } = useStyleCardPhoto();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
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

  // Upload one or more photos, then keep the Home "Current style" card honest:
  //  - single upload, auto mode  → nothing to ask, just refresh the card
  //  - batch upload              → ask which one should be the main photo
  //  - a pin already exists      → ask before overriding an explicit choice
  const handlePick = async (files: File[]) => {
    if (files.length === 0 || !user) return;
    const today = new Date().toISOString().slice(0, 10);
    const insertedIds: string[] = [];
    for (const file of files) {
      const path = await upload(file);
      if (!path) { toast.error("Upload failed"); continue; }
      const { data, error } = await supabase
        .from("user_milestone_photos")
        .insert({ user_id: user.id, storage_path: path, taken_on: today })
        .select("id")
        .maybeSingle();
      if (error) {
        console.error(error);
        toast.error("Could not save");
        continue;
      }
      if (data?.id) insertedIds.push(data.id as string);
    }
    if (insertedIds.length === 0) return;
    toast.success(insertedIds.length > 1 ? "Milestone photos added" : "Milestone photo added");
    await load();
    // Home reads through react-query — invalidate so the card changes now,
    // with no reload.
    await refreshCardPhoto();
    if (insertedIds.length > 1) {
      setPickerOpen(true);
    } else if (mainPhotoId) {
      setSwitchTo(insertedIds[0]);
    }
  };

  const removeRow = async (r: Row) => {
    if (!user) return;
    await supabase.from("user_milestone_photos").delete().eq("id", r.id);
    await supabase.storage.from("milestone-photos").remove([r.storage_path]);
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    // Deleting the pinned photo clears main_photo_id (ON DELETE SET NULL),
    // so the card drops back to auto mode — refresh to pick that up.
    await refreshCardPhoto();
  };


  const daysSinceLast = rows[0]
    ? Math.floor((Date.now() - new Date(rows[0].taken_on).getTime()) / 86_400_000)
    : null;

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Progress Photos" onBack={smartBack(navigate, "/profile")} />
      <LevelGate min={2}>
        <ItalicSub>
          A 6-week cadence is enough to see real change without obsessing day to day.
        </ItalicSub>
      </LevelGate>

      <div className="px-5 pb-6 space-y-4">
        {/* Her goals and challenges live here now (moved off Home, Sept 2026) —
            same card, same editing. */}
        <GoalsChallengesCard />

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
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            void handlePick(picked);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />

        <MainPhotoPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="Which of these would you like as your main photo?"
          description="Your Current style card will show the one you pick. Choosing “Use my most recent photo” keeps it following your newest photo."
        />

        <AlertDialog open={!!switchTo} onOpenChange={(o) => { if (!o) setSwitchTo(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">Use your new photo on Home?</AlertDialogTitle>
              <AlertDialogDescription>
                You've pinned a main photo before, so we won't change it without asking.
                Switch your Current style card to the photo you just added?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setSwitchTo(null)}>Keep the current one</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const id = switchTo;
                  setSwitchTo(null);
                  if (id) {
                    setMainPhoto.mutate(id, {
                      onSuccess: () => toast.success("Main photo updated"),
                      onError: () => toast.error("Could not update your main photo"),
                    });
                  }
                }}
              >
                Use the new one
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


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
