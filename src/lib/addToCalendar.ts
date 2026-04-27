// Universal "Add to Calendar" helper.
// Generates an RFC-5545 .ics file and triggers a download / open.
// On iOS Safari this prompts to add to Apple Calendar.
// On Android it opens with Google Calendar / device calendar app.
// On desktop it downloads the file which can be opened by Outlook,
// Apple Calendar, Google Calendar (import), Thunderbird, etc.

export interface CalendarEvent {
  /** Short title shown in the user's calendar */
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** Optional HH:mm (24h). If absent the event is all-day. */
  time?: string | null;
  /** Duration in minutes. Defaults to 60 for timed events. Ignored for all-day. */
  durationMinutes?: number;
  /** Optional location string */
  location?: string | null;
  /** Optional long description / notes */
  description?: string | null;
  /** Optional stable id used for UID. A random one is generated if absent. */
  uid?: string;
}

const pad = (n: number) => n.toString().padStart(2, "0");

const escapeIcs = (s: string): string =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const toUtcStamp = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
    d.getUTCHours(),
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

const toAllDayStamp = (iso: string): string => iso.replace(/-/g, "");

/** Build the .ics string for an event */
export const buildIcs = (event: CalendarEvent): string => {
  const uid =
    event.uid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}@strand.app`;
  const stamp = toUtcStamp(new Date());

  let dtStart: string;
  let dtEnd: string;
  let allDay = false;

  if (event.time && /^\d{1,2}:\d{2}/.test(event.time)) {
    const [hh, mm] = event.time.split(":").map((p) => parseInt(p, 10));
    // Treat the supplied date+time as the user's local time
    const start = new Date(`${event.date}T${pad(hh)}:${pad(mm)}:00`);
    const end = new Date(start.getTime() + (event.durationMinutes ?? 60) * 60_000);
    dtStart = `DTSTART:${toUtcStamp(start)}`;
    dtEnd = `DTEND:${toUtcStamp(end)}`;
  } else {
    allDay = true;
    // For all-day, DTEND is exclusive (next day)
    const startStamp = toAllDayStamp(event.date);
    const next = new Date(`${event.date}T00:00:00`);
    next.setDate(next.getDate() + 1);
    const endStamp = `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
    dtStart = `DTSTART;VALUE=DATE:${startStamp}`;
    dtEnd = `DTEND;VALUE=DATE:${endStamp}`;
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//STRAND//Hair Journal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escapeIcs(event.title)}`,
    event.location ? `LOCATION:${escapeIcs(event.location)}` : null,
    event.description ? `DESCRIPTION:${escapeIcs(event.description)}` : null,
    !allDay ? "BEGIN:VALARM" : null,
    !allDay ? "ACTION:DISPLAY" : null,
    !allDay ? `DESCRIPTION:${escapeIcs(event.title)}` : null,
    !allDay ? "TRIGGER:-PT30M" : null,
    !allDay ? "END:VALARM" : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
};

const safeFileName = (s: string): string =>
  s.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "event";

/**
 * Trigger an .ics download / handoff.
 * On iOS/Android the OS will offer to add the event to the default calendar app.
 * On desktop the file is downloaded and can be opened by any calendar app.
 */
export const addToCalendar = (event: CalendarEvent): void => {
  const ics = buildIcs(event);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName(event.title)}.ics`;
  // Some iOS versions need the link in the DOM
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke async so the browser has time to handle the click
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
