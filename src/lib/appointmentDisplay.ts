/**
 * Shared display rules so the member's log and the professional's diary
 * describe the SAME appointment the same way.
 *
 * "What it's for" is whatever the member typed when they logged it (`service`,
 * falling back to the older `reason` field). "Where" comes from the format they
 * chose — in person resolves to the salon/clinic name, or "In salon" when the
 * name isn't recorded.
 */
export interface AppointmentDisplayInput {
  service?: string | null;
  reason?: string | null;
  location_format?: string | null;
  clinic_name?: string | null;
}

export const appointmentPurpose = (a: AppointmentDisplayInput): string | null =>
  a.service?.trim() || a.reason?.trim() || null;

export const appointmentWhere = (a: AppointmentDisplayInput): string | null => {
  const clinic = a.clinic_name?.trim() || null;
  const format = (a.location_format ?? "").trim();
  if (format === "in_person") return clinic || "In salon";
  if (format === "virtual" || format === "online") return "Virtual appointment";
  if (format === "phone") return "Phone appointment";
  return clinic;
};
