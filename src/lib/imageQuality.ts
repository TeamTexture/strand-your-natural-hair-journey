// Scraped product/tool images occasionally come back as page chrome — a support
// widget, a payment badge, a logo, or a 1x1 tracking pixel. Those render as a
// blurry or blank tile in the thumbnails and on the profile hero, so anything
// flagged here is treated as "no image" and the initials placeholder shows
// instead.
//
// IMPORTANT: the chrome test runs against the FILENAME only (the last path
// segment), never the whole URL. Legitimate retailer CDN paths routinely
// contain words like `logo`, `icon`, `badge`, `secure`, `search`, `menu`,
// `cart`, `support`, `help` and `social` in directory names, and testing the
// full URL threw away real product shots.

/** Unambiguous chrome filenames. Tested against the last path segment only. */
const CHROME_RE =
  /(union[-_]?jack|\bicon\b|^icons?[-_.]|[-_]icon[-_.]|logo|sprite|payment|visa|mastercard|amex|paypal|klarna|applepay|gpay|trustpilot|placeholder|spinner|loader|1x1|blank|transparent|burger|chevron)/i;

/** Tracking-pixel style dimension tokens that are never a product shot. */
const PIXEL_RE = /(^|[^\d])1\s*[x×]\s*1([^\d]|$)/;

function lastSegment(url: string): string {
  const withoutQuery = url.split("?")[0].split("#")[0];
  const parts = withoutQuery.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * Repairs the URL shapes we have actually seen stored: HTML-escaped
 * ampersands (`&amp;width=1800`), protocol-relative URLs (`//cdn…`) and
 * http on an https page. Display-only — nothing is written back.
 */
export function normaliseImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let u = url.trim();
  if (!u) return null;
  u = u.replace(/&amp;/gi, "&");
  if (u.startsWith("//")) u = "https:" + u;
  else if (/^http:\/\//i.test(u)) u = "https://" + u.slice("http://".length);
  return u;
}

const TARGET_WIDTH = 1200;

/**
 * Small variants are usually a genuine product shot served at list size, not
 * junk. Instead of discarding them, ask the CDN for a bigger one: raise the
 * `w`/`width` query param and swap a small `NxN` dimension token.
 */
export function upsizeImageUrl(url: string): string {
  let out = url.replace(
    /([?&])(w|width)=(\d+)/gi,
    (whole, sep: string, key: string, val: string) =>
      Number(val) < 600 ? `${sep}${key}=${TARGET_WIDTH}` : whole,
  );
  out = out.replace(
    /(^|[^\d])(\d{2,3})\s*[x×]\s*(\d{2,3})([^\d]|$)/,
    (whole, pre: string, a: string, b: string, post: string) =>
      Number(a) < 200 && Number(b) < 200 && !(Number(a) === 1 && Number(b) === 1)
        ? `${pre}${TARGET_WIDTH}x${TARGET_WIDTH}${post}`
        : whole,
  );
  return out;
}

/** True when the URL is almost certainly not a product photo at all. */
export function isJunkImageUrl(url: string | null | undefined): boolean {
  const u = normaliseImageUrl(url);
  if (!u) return false;
  if (/^data:/i.test(u)) return true;
  const file = lastSegment(u);
  if (/\.svg$/i.test(file)) return true;
  if (PIXEL_RE.test(file)) return true;
  if (CHROME_RE.test(file)) return true;
  return false;
}

/**
 * Returns a usable product image URL, or null when the URL is genuine junk.
 * Small variants are upsized rather than rejected.
 */
export function usableImageUrl(url: string | null | undefined): string | null {
  const u = normaliseImageUrl(url);
  if (!u) return null;
  if (isJunkImageUrl(u)) return null;
  return upsizeImageUrl(u);
}
