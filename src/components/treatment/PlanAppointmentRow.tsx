import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fromDateKey } from "@/lib/treatmentSchedule";
import { appointmentPurpose, appointmentWhere } from "@/lib/appointmentDisplay";

export interface PlanAppointment {
  id: string;
  professional_name: string;
  professional_type: string | null;
  clinic_name: string | null;
  appointment_date: string;
  appointment_time: string | null;
  service: string | null;
  reason: string | null;
  location_format: string | null;
  status: string;
}

/** Every appointment attached to a plan, in date order. */
export function usePlanAppointments(planId?: string) {
  const { user } = useAuth();
  const { data = [] } = useQuery({
    queryKey: ["plan-appointments", planId, user?.id],
    enabled: !!user && !!planId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("appointments")
        .select(
          "id, professional_name, professional_type, clinic_name, appointment_date, appointment_time, service, reason, location_format, status",
        )
        .eq("user_id", user!.id)
        .eq("treatment_plan_id", planId!)
        .order("appointment_date", { ascending: true });
      if (error) throw error;
      return (rows ?? []) as PlanAppointment[];
    },
  });
  return data;
}

/**
 * One appointment, in full: who, when, where and what it's for. Cancelled
 * visits stay in the plan and read as cancelled rather than vanishing.
 * Tapping opens the same editor as the member's appointments list.
 */
const PlanAppointmentRow = ({
  appointment: a,
  planId,
}: {
  appointment: PlanAppointment;
  planId: string;
}) => {
  const navigate = useNavigate();
  const off = a.status === "cancelled";
  const purpose = appointmentPurpose(a);
  const where = appointmentWhere(a);

  return (
    <button
      type="button"
      onClick={() => navigate(`/appointments/log?fromId=${a.id}&planId=${planId}`)}
      className={`w-full text-left rounded-xl border px-3 py-2.5 space-y-0.5 ${
        off ? "border-border bg-muted/30" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={`min-w-0 font-body text-[13.5px] font-semibold [overflow-wrap:anywhere] ${
            off ? "line-through text-muted-foreground" : ""
          }`}
        >
          {a.professional_name}
        </p>
        {off && (
          <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Cancelled
          </span>
        )}
      </div>

      <p className={`font-body text-[11.5px] text-muted-foreground ${off ? "line-through" : ""}`}>
        {format(fromDateKey(a.appointment_date), "EEE d MMM yyyy")}
        {a.appointment_time ? ` · ${a.appointment_time}` : ""}
        {a.professional_type ? ` · ${a.professional_type}` : ""}
      </p>

      {where && (
        <p className="flex items-center gap-1 font-body text-[11.5px] text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{where}</span>
        </p>
      )}

      {purpose && (
        <p className="font-body text-[12.5px] text-muted-foreground leading-snug pt-0.5 [overflow-wrap:anywhere]">
          {purpose}
        </p>
      )}

      <p className="font-body text-[11px] text-primary pt-0.5">Tap to change</p>
    </button>
  );
};

export default PlanAppointmentRow;
