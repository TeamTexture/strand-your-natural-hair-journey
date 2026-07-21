// Defensive normalisation for external social/website links.
// Accepts pasted URLs, @handles, or bare handles and returns a clean handle
// plus a canonical https URL suitable for target="_blank" navigation.

/** Extract a bare Instagram handle from any of: `@name`, `name`, or a full URL. */
export function normalizeInstagramHandle(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input).trim();
  if (!s) return "";
  // If it's a URL, pull the first path segment.
  const urlMatch = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (urlMatch) s = urlMatch[1];
  // Strip leading @, whitespace, and any trailing slash/query.
  s = s.replace(/^@+/, "").replace(/[/?#].*$/, "").trim();
  return s;
}

/** Build a canonical Instagram profile URL, or "" when no handle. */
export function instagramUrl(input: string | null | undefined): string {
  const handle = normalizeInstagramHandle(input);
  return handle ? `https://www.instagram.com/${handle}/` : "";
}

/** Normalise a website URL: prepend https:// when missing, trim whitespace. */
export function normalizeWebsiteUrl(input: string | null | undefined): string {
  if (!input) return "";
  const s = String(input).trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;
  // mailto: / tel: pass through
  if (/^(mailto:|tel:)/i.test(s)) return s;
  return `https://${s}`;
}

/** Attrs to spread onto any anchor that must escape the phone frame / iframe. */
export const externalLinkProps = {
  target: "_blank" as const,
  rel: "noopener noreferrer" as const,
};
