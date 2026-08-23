// Best-effort visitor country detection for the UK-only registration gate.
//
// Order of preference:
//  1. Edge/CDN geo headers on the incoming request (cf-ipcountry, x-vercel-ip-country,
//     x-country-code, fly-client-ip-country …). Free and instant when present.
//  2. IP geolocation lookup on the client IP (ipapi.co) when no header is set.
//
// Returns { country: "GB" | "US" | ... | null, source, ip_seen }. `null` means
// detection was inconclusive — the caller decides how to treat that.

import { preflight, json } from "../_shared/cors.ts";

const HEADER_CANDIDATES = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "x-country-code",
  "fly-client-ip-country",
  "cloudfront-viewer-country",
  "x-geo-country",
  "x-appengine-country",
];

const IP_HEADERS = ["x-forwarded-for", "x-real-ip", "cf-connecting-ip", "fly-client-ip"];

const clientIp = (req: Request): string | null => {
  for (const h of IP_HEADERS) {
    const raw = req.headers.get(h);
    if (raw) {
      const first = raw.split(",")[0]?.trim();
      if (first) return first;
    }
  }
  return null;
};

const isPrivate = (ip: string) =>
  ip.startsWith("10.") ||
  ip.startsWith("127.") ||
  ip.startsWith("192.168.") ||
  ip.startsWith("172.16.") ||
  ip === "::1" ||
  ip.startsWith("fc") ||
  ip.startsWith("fd");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const seen: Record<string, string> = {};
  for (const h of [...HEADER_CANDIDATES, ...IP_HEADERS]) {
    const v = req.headers.get(h);
    if (v) seen[h] = v;
  }

  for (const h of HEADER_CANDIDATES) {
    const v = req.headers.get(h);
    if (v && /^[A-Za-z]{2}$/.test(v.trim())) {
      return json(200, {
        country: v.trim().toUpperCase(),
        source: `header:${h}`,
        headers_seen: seen,
      });
    }
  }

  const ip = clientIp(req);
  if (ip && !isPrivate(ip)) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
        signal: ctrl.signal,
        headers: { "User-Agent": "strand-geo-gate/1.0" },
      });
      clearTimeout(t);
      if (res.ok) {
        const body = await res.json();
        const code = typeof body?.country_code === "string" ? body.country_code : null;
        if (code && /^[A-Za-z]{2}$/.test(code)) {
          return json(200, {
            country: code.toUpperCase(),
            source: "ipapi",
            ip_seen: ip,
            headers_seen: seen,
          });
        }
      }
    } catch (_e) {
      // fall through to inconclusive
    }
  }

  return json(200, { country: null, source: "inconclusive", ip_seen: ip, headers_seen: seen });
});
