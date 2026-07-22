import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Search, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import AppointmentCard from "@/components/AppointmentCard";
import type { AppointmentCardData } from "@/components/AppointmentCard";
import EnquiriesListInline from "@/components/EnquiriesListInline";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePhotoUploader } from "@/hooks/usePhotoUploader";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
import { smartBack } from "@/lib/smartBack";
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


type Appointment = AppointmentCardData;



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

type Tab = "appointments" | "enquiries";

const Appointments = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "enquiries" ? "enquiries" : "appointments";
  const setTab = (next: Tab) => {
    if (next === tab) return;
    const p = new URLSearchParams(params);
    if (next === "appointments") p.delete("tab");
    else p.set("tab", next);
    setParams(p, { replace: true });
  };
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null);
  const [search, setSearch] = useState("");

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

  const filteredAppts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return appts;
    return appts.filter((a) => {
      const haystack = [
        a.professional_name,
        a.professional_type,
        a.clinic_name,
        a.reason,
        a.notes,
        a.outcome_notes,
        a.appointment_date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [appts, search]);

  // Status is the source of truth: anything marked "completed" belongs in Past
  // regardless of date; anything else is Upcoming unless its date has already
  // slipped into the past (in which case we still show it under Past so it
  // doesn't hang around the top of the list forever).
  const upcoming = filteredAppts.filter((a) => a.status !== "completed" && a.appointment_date >= today);
  const past = filteredAppts.filter((a) => a.status === "completed" || a.appointment_date < today);

  const goLog = () => navigate("/appointments/log");

  return (
    <ScreenLayout bottomNav>
      <TitleBar
        title="Appointments"
        onBack={smartBack(navigate, "/profile")}
      />

      {/* Segmented control */}
      <div className="px-5 pt-3">
        <div className="flex p-1 rounded-full bg-secondary/60 border border-border">
          {(["appointments", "enquiries"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "flex-1 h-9 rounded-full text-[12px] font-body font-semibold transition-colors",
                tab === k
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "appointments" ? "Appointments" : "Enquiries sent"}
            </button>
          ))}
        </div>
      </div>

      {tab === "enquiries" ? (
        <div className="px-5 pt-4 pb-8">
          <EnquiriesListInline />
        </div>
      ) : (
      <>
      <div className="px-5 pt-3 pb-2">
        <Button variant="gold" size="pill" onClick={goLog} className="w-full">
          + Log Appointment
        </Button>
      </div>

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
          <div className="px-5 pt-2 pb-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, clinic, type, notes…"
                className="w-full pl-10 pr-9 py-2.5 rounded-full border border-border bg-secondary/60 text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                aria-label="Search appointments"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          {filteredAppts.length === 0 && (
            <div className="px-5 py-8">
              <EmptyState
                icon="🔍"
                message="No matches"
                hint={`Nothing found for "${search.trim()}". Try a different keyword.`}
              />
            </div>
          )}

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
      </>
      )}



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
