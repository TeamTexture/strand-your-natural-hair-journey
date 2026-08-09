// Scraped product/tool images occasionally come back as page chrome — a support
// widget, a payment badge, a logo, or a 32x32 icon variant from a CDN. Those
// render as a blurry or blank tile in the thumbnails and on the profile hero.
// Anything flagged here is treated as "no image" so the initials placeholder
// shows instead, which reads far better than a broken-looking icon.

const CHROME_RE =
  /(flag|union[-_]?jack|\bicon\b|icons?\/|logo|sprite|badge|payment|visa|mastercard|amex|paypal|klarna|applepay|gpay|trustpilot|placeholder|avatar|spinner|loader|pixel|1x1|blank|transparent|social|instagram|facebook|tiktok|twitter|youtube|pinterest|cart|search|menu|arrow|chevron|close|burger|newsletter|cookie|support|24[-_]?7|help|chat|contact|guarantee|warranty|secure|ssl)/i;

/** True when the URL is almost certainly not the hero product shot. */
export function isJunkImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim();
  if (!u) return false;
  if (/^data:/i.test(u)) return true;
  const clean = u.split("?")[0];
  if (/\.svg$/i.test(clean)) return true;
  if (CHROME_RE.test(u)) return true;
  // CDN size tokens: s32x32_, /80x80/, -100x100.
  const dim = u.match(/(?:^|[^\d])(\d{1,3})\s*[x×]\s*(\d{1,3})(?:[^\d]|$)/);
  if (dim && Number(dim[1]) < 200 && Number(dim[2]) < 200) return true;
  const w = u.match(/[?&](?:w|width)=(\d+)/i);
  if (w && Number(w[1]) < 200) return true;
  return false;
}

/** Returns the URL only when it looks like a real product photo. */
export function usableImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return isJunkImageUrl(url) ? null : url;
}
