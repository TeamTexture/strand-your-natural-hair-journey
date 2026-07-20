import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import AppointmentCard from "@/components/AppointmentCard";
import type { AppointmentCardData } from "@/components/AppointmentCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePhotoUploader } from "@/hooks/usePhotoUploader";
import { toast } from "sonner";
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


interface Appointment extends AppointmentCardData {}


const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};
/** Inline photo strip for one appointment. Loads on mount and signs URLs. */
const ApptPhotos = ({ appointmentId }: { appointmentId: string }) => {
  const { sign } = usePhotoUploader("appointment-photos");
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("appointment_photos")
        .select("storage_path")
        .eq("appointment_id", appointmentId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const rows = (data ?? []) as Array<{ storage_path: string }>;
      const signed: string[] = [];
      for (const r of rows) {
        const u = await sign(r.storage_path);
        if (u) signed.push(u);
      }
      if (!cancelled) setUrls(signed);
    })();
    return () => { cancelled = true; };
  }, [appointmentId, sign]);
  if (urls.length === 0) return null;
  return (
    <div className="flex gap-2 mt-3 overflow-x-auto -mx-1 px-1">
      {urls.map((u, i) => (
        <a key={i} href={u} target="_blank" rel="noreferrer" className="size-16 rounded-[10px] overflow-hidden bg-muted shrink-0 block">
          <img src={u} alt={`Appointment photo ${i + 1}`} className="size-full object-cover" />
        </a>
      ))}
    </div>
  );
};

const Appointments = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null);

  const handleDelete = async () => {
    if (!user || !deleteTarget) return;
    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", deleteTarget.id)
      .eq("user_id", user.id);
    if (error) {
      console.error("Appointment delete failed:", error);
      toast.error("Could not delete appointment");
    } else {
      setAppts((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      toast.success("Appointment deleted");
    }
    setDeleteTarget(null);
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("user_id", user.id)
        .order("appointment_date", { ascending: false });
      if (cancelled) return;
      if (error) console.error("Appointments load failed:", error);
      else setAppts((data ?? []) as Appointment[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const today = new Date().toISOString().slice(0, 10);
  // Status is the source of truth: anything marked "completed" belongs in Past
  // regardless of date; anything else is Upcoming unless its date has already
  // slipped into the past (in which case we still show it under Past so it
  // doesn't hang around the top of the list forever).
  const upcoming = appts.filter((a) => a.status !== "completed" && a.appointment_date >= today);
  const past = appts.filter((a) => a.status === "completed" || a.appointment_date < today);

  const goLog = () => navigate("/appointments/log");

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="Appointments"
        onBack={() => navigate("/profile")}
      />

      {loading ? (
        <LoadingDot label="Loading appointments…" fullScreen={false} />
      ) : appts.length === 0 ? (
        <div className="px-5 py-8">
          <EmptyState
            icon="📅"
            message="No appointments logged"
            hint="Tap + Log above to add your first."
          />
          <div className="mt-4">
            <Button variant="gold" size="pill" onClick={goLog}>
              + Log Appointment
            </Button>
          </div>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <SectionLabel>Upcoming</SectionLabel>
              <div className="px-5 pb-4 space-y-3">
                {upcoming.map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appointment={a}
                    variant="upcoming"
                    onEdit={() => navigate(`/appointments/log?fromId=${a.id}`)}
                    onDelete={() => setDeleteTarget(a)}
                  >
                    <ApptPhotos appointmentId={a.id} />
                  </AppointmentCard>
                ))}
              </div>
            </>
          )}


          {past.length > 0 && (
            <>
              <SectionLabel>Past</SectionLabel>
              <div className="px-5 space-y-3 pb-4">
                {past.map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appointment={a}
                    variant="past"
                    onEdit={() => navigate(`/appointments/log?fromId=${a.id}`)}
                    onDelete={() => setDeleteTarget(a)}
                  >
                    <ApptPhotos appointmentId={a.id} />
                  </AppointmentCard>
                ))}
              </div>
            </>
          )}


          <div className="px-5 pb-4">
            <Button variant="goldOutline" size="pill" onClick={goLog}>
              + Log Appointment
            </Button>
          </div>
        </>
      )}

      <div className="px-5 pb-8">
        <button
          onClick={() => navigate("/directory")}
          className="w-full p-4 rounded-[14px] bg-secondary border border-border flex items-center gap-3 text-left min-h-[64px]"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">🔍 Find Recommended Professionals</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Verified trichologists, dermatologists & curl specialists
            </p>
          </div>
          <ChevronRight className="size-5 text-primary shrink-0" />
        </button>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove your appointment with <strong>{deleteTarget?.professional_name}</strong> on{" "}
              {deleteTarget ? formatDate(deleteTarget.appointment_date) : ""}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
  );
};

export default Appointments;
