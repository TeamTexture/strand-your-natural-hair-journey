import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, ChevronRight, Pencil, Trash2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import AddToCalendarButton from "@/components/AddToCalendarButton";
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

interface Appointment {
  id: string;
  professional_name: string;
  professional_type: string | null;
  clinic_name: string | null;
  appointment_date: string;
  appointment_time: string | null;
  reason: string | null;
  notes: string | null;
  status: string;
  follow_up_needed: boolean;
}

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
                  <SurfaceCard key={a.id}>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      {a.professional_type ?? "Appointment"} · {formatDate(a.appointment_date)}
                      {a.appointment_time ? ` · ${a.appointment_time}` : ""}
                    </p>
                    <div className="flex items-center gap-3">
                      <ProAvatar name={a.professional_name} size="size-10" />
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-base font-semibold leading-tight truncate">
                          {a.professional_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {[a.clinic_name, a.reason].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <span className="bg-primary/15 text-primary text-[10px] uppercase tracking-[0.15em] font-medium px-2 py-1 rounded shrink-0">
                        Soon
                      </span>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/appointments/log?fromId=${a.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card text-[11px] font-body hover:bg-muted/40 transition-colors min-h-[36px]"
                        aria-label="Edit appointment"
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </button>
                      <AddToCalendarButton
                        event={{
                          title: `${a.professional_type ?? "Appointment"} — ${a.professional_name}`,
                          date: a.appointment_date,
                          time: a.appointment_time,
                          durationMinutes: 60,
                          location: a.clinic_name,
                          description: [a.reason, a.notes].filter(Boolean).join("\n\n") || undefined,
                          uid: `appt-${a.id}@strand.app`,
                        }}
                      />
                    </div>
                    <ApptPhotos appointmentId={a.id} />
                  </SurfaceCard>
                ))}
              </div>
            </>
          )}

          {past.length > 0 && (
            <>
              <SectionLabel>Past</SectionLabel>
              <div className="px-5 space-y-3 pb-4">
                {past.map((a) => (
                  <SurfaceCard key={a.id}>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      {a.professional_type ?? "Appointment"} · {formatDate(a.appointment_date)}
                    </p>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="size-10 rounded-[10px] bg-good/15 flex items-center justify-center shrink-0">
                        <Shield className="size-5 text-good" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-sm font-semibold truncate">
                          {a.professional_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {[a.clinic_name, a.reason].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      {a.follow_up_needed && (
                        <span className="bg-warn/15 text-warn text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0">
                          Follow-up
                        </span>
                      )}
                    </div>
                    {a.notes && (
                      <p className="text-[11px] text-foreground/80 leading-relaxed border-t border-border pt-2">
                        {a.notes}
                      </p>
                    )}
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => navigate(`/appointments/log?fromId=${a.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card text-[11px] font-body hover:bg-muted/40 transition-colors min-h-[36px]"
                        aria-label="Edit appointment"
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </button>
                    </div>
                    <ApptPhotos appointmentId={a.id} />
                  </SurfaceCard>
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
    </ScreenLayout>
  );
};

export default Appointments;
