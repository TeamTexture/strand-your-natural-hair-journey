import { describe, expect, it } from "vitest";
import {
  appointmentLocationOf,
  appointmentTitleOf,
  isPastAppointment,
  isPastDateIso,
  upcomingAppointments,
} from "@/lib/appointmentState";
import { googleCalendarUrl } from "@/lib/addToCalendar";

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

describe("appointment shared accessor", () => {
  it("treats a future non-terminal appointment as upcoming on both sides", () => {
    const rows = [
      { appointment_date: iso(5), status: "upcoming" },
      { appointment_date: iso(2), status: "upcoming" },
      { appointment_date: iso(-3), status: "upcoming" },
      { appointment_date: iso(9), status: "cancelled" },
    ];
    const up = upcomingAppointments(rows);
    // Soonest first, past and terminal excluded.
    expect(up.map((r) => r.appointment_date)).toEqual([iso(2), iso(5)]);
    expect(rows.filter(isPastAppointment)).toHaveLength(2);
  });

  it("builds one title and location string for every surface", () => {
    const row = {
      appointment_date: iso(1),
      service: "Silk press",
      professional_name: "Erica Liburd",
      clinic_name: "The Muse Salon",
      location_format: "in_person",
    };
    expect(appointmentTitleOf(row)).toBe("Silk press with Erica Liburd");
    expect(appointmentLocationOf(row)).toBe("The Muse Salon (in person)");
    expect(appointmentLocationOf({ ...row, clinic_name: null, location_format: "virtual" })).toBe(
      "Virtual",
    );
  });

  it("flags a past date so the log can confirm the user meant it", () => {
    expect(isPastDateIso(iso(-1))).toBe(true);
    expect(isPastDateIso(iso(1))).toBe(false);
    expect(isPastDateIso("")).toBe(false);
  });
});

describe("google calendar template url", () => {
  it("prefills title, timed range and location without any OAuth", () => {
    const url = googleCalendarUrl({
      title: "Consultation with Erica",
      date: "2026-09-01",
      time: "14:30",
      location: "The Muse Salon",
    });
    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20260901T143000%2F20260901T153000");
    expect(url).toContain("location=The+Muse+Salon");
  });
});
