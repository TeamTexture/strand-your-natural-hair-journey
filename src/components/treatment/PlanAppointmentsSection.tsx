import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarPlus, MapPin } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fromDateKey } from "@/lib/treatmentSchedule";

type PlanAppointment = {
  id: string;
  professional_name: string;
  professional_type: string | null;
  clinic_name: string | null;
  appointment_date: string;
  appointment_time: string | null;
  reason: string | null;
  status: string;
};

/**
 * Appointments attached to a treatment plan. The plan is the context, but the
 * appointment itself lives in the member's normal appointments list — this is a
 * view onto the same records, filtered by `treatment_plan_id`.
 */
const PlanAppointmentsSection = ({ planId, disabled }: { planId: string; disabled?: boolean }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: appointments = [] } = useQuery({
    queryKey: ["plan-appointments", planId, user?.id],
    enabled: !!user && !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, professional_name, professional_type, clinic_name, appointment_date, appointment_time, reason, status",
        )
        .eq("user_id", user!.id)
        .eq("treatment_plan_id", planId)
        .order("appointment_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanAppointment[];
    },
  });

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const upcoming = appointments.filter((a) => a.status !== "completed" && a.status !== "cancelled" && a.appointment_date >= todayKey);
  const past = appointments.filter((a) => !upcoming.includes(a));

  const schedule = () =>
    navigate(`/appointments/log?planId=${planId}`);

  const row = (a: PlanAppointment, dim?: boolean) => (
    <SurfaceCard
      key={a.id}
      className={dim ? "opacity-70 space-y-0.5" : "space-y-0.5"}
      onClick={() => navigate(`/appointments/log?fromId=${a.id}&planId=${planId}`)}
      role="button"
      tabIndex={0}
    >
      <p className="font-body text-[14px] font-semibold break-words">{a.professional_name}</p>
      <p className="font-body text-[12px] text-muted-foreground">
        {format(fromDateKey(a.appointment_date), "EEE d MMM yyyy")}
        {a.appointment_time ? ` · ${a.appointment_time}` : ""}
        {a.professional_type ? ` · ${a.professional_type}` : ""}
      </p>
      {a.clinic_name && (
        <p className="font-body text-[12px] text-muted-foreground flex items-center gap-1">
          <MapPin className="size-3 shrink-0" /> <span className="break-words">{a.clinic_name}</span>
        </p>
      )}
      {a.reason && (
        <p className="font-body text-[13px] text-muted-foreground leading-snug pt-1 [overflow-wrap:anywhere]">
          {a.reason}
        </p>
      )}
    </SurfaceCard>
  );

  return (
    <div className="space-y-2">
      <SectionLabel className="px-0 mt-0 mb-1.5">Appointments</SectionLabel>

      {appointments.length === 0 ? (
        <SurfaceCard>
          <p className="font-body text-[13px] text-muted-foreground leading-snug">
            Add any salon, trichologist or clinic visits that belong to this plan, so your dates and
            your steps sit together.
          </p>
        </SurfaceCard>
      ) : (
        <div className="space-y-1.5">
          {upcoming.map((a) => row(a))}
          {past.length > 0 && (
            <>
              <p className="font-body text-[11px] uppercase tracking-[0.16em] text-muted-foreground pt-1">
                Been and gone
              </p>
              {past.map((a) => row(a, true))}
            </>
          )}
        </div>
      )}

      {!disabled && (
        <Button variant="outline" className="rounded-pill w-full" onClick={schedule}>
          <CalendarPlus className="size-4 mr-1.5" /> Schedule an appointment
        </Button>
      )}
    </div>
  );
};

export default PlanAppointmentsSection;
