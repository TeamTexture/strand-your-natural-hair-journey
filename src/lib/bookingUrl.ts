// Booking page link helpers.
// A professional's booking link powers the "Book appointment" button inside
// pro–client chats, so it must always resolve to a real https destination.

/** Normalise a pasted booking link: trim, prepend https:// when missing. */
export function normalizeBookingUrl(input: string | null | undefined): string {
  if (!input) return "";
  const s = String(input).trim();
  if (!s) return "";
  if (/^http:\/\//i.test(s)) return `https://${s.slice(7)}`;
  if (/^https:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https://${s.slice(2)}`;
  return `https://${s}`;
}

/** Is this a usable https booking link (real host, no spaces)? */
export function isValidBookingUrl(input: string | null | undefined): boolean {
  const normalised = normalizeBookingUrl(input);
  if (!normalised) return false;
  if (/\s/.test(normalised)) return false;
  try {
    const url = new URL(normalised);
    if (url.protocol !== "https:") return false;
    // Require a dotted host with a plausible TLD (rejects "https://foo").
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(url.hostname);
  } catch {
    return false;
  }
}
