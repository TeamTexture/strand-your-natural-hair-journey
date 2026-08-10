/**
 * ONE accessor for appointment state, mirroring the `matchScoreOf` discipline:
 * no component computes its own view of whether an appointment is upcoming, how
 * it should be titled, or where it takes place.
 *
 * Both sides of an appointment — the member's calendar and the professional's
 * diary — read the SAME `appointments` row through these helpers.
 */

export type LocationFormat = "in_person" | "virtual";

/** The minimum shape every surface has available from the appointments table. */
export interface AppointmentLike {
  appointment_date: string;
  appointment_time?: string | null;
  status?: string | null;
  service?: string | null;
  reason?: string | null;
  professional_name?: string | null;
  clinic_name?: string | null;
  location_format?: string | null;
  notes?: string | null;
  linked_pro_user_id?: string | null;
}

const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

/** Statuses that mean the appointment is closed out, whatever the date says. */
const TERMINAL = new Set(["completed", "cancelled", "attended", "no_show"]);

export const isUpcomingAppointment = (a: AppointmentLike): boolean =>
  !TERMINAL.has((a.status ?? "").toLowerCase()) && a.appointment_date >= todayIso();

export const isPastAppointment = (a: AppointmentLike): boolean => !isUpcomingAppointment(a);

/** Soonest-first for upcoming, most-recent-first for past. */
export const sortUpcomingFirst = <T extends AppointmentLike>(rows: T[]): T[] =>
  [...rows].sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));

export const upcomingAppointments = <T extends AppointmentLike>(rows: T[]): T[] =>
  sortUpcomingFirst(rows.filter(isUpcomingAppointment));

/** What the appointment is FOR. Service is the member's own words. */
export const appointmentServiceOf = (a: AppointmentLike): string =>
  (a.service ?? "").trim() || (a.reason ?? "").trim() || "Appointment";

export const locationFormatLabel = (v?: string | null): string | null => {
  if (v === "in_person") return "In person";
  if (v === "virtual") return "Virtual";
  return null;
};

/** Human place-string: the clinic if known, otherwise the format. */
export const appointmentLocationOf = (a: AppointmentLike): string | null => {
  const clinic = (a.clinic_name ?? "").trim();
  const format = locationFormatLabel(a.location_format);
  if (clinic && format) return `${clinic} (${format.toLowerCase()})`;
  return clinic || format;
};

/** Calendar/list title, used by both the .ics export and the Google URL. */
export const appointmentTitleOf = (a: AppointmentLike): string => {
  const who = (a.professional_name ?? "").trim();
  const what = appointmentServiceOf(a);
  return who ? `${what} with ${who}` : what;
};

export const isPastDateIso = (iso: string): boolean => !!iso && iso < todayIso();

/** Cancelled appointments stay in the diary — they are never hidden, only marked. */
export const isCancelledAppointment = (a: AppointmentLike): boolean =>
  (a.status ?? "").toLowerCase() === "cancelled";
