// ONE place for the app's base URL and sender identities.
// Never hardcode a host in an edge function or a template again.
//
// APP_BASE_URL can be overridden with a project secret of the same name;
// the fallback is the live custom domain (NOT the lovable.app subdomain).
export const APP_BASE_URL = (
  Deno.env.get("APP_BASE_URL") || "https://www.mystrand.co.uk"
).replace(/\/+$/, "");

/** Absolute app URL for an in-app path. */
export const appUrl = (path: string): string => {
  if (!path) return APP_BASE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${APP_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
};

/** Verified Resend sender identities on mystrand.co.uk. */
export const FROM_NOTIFICATIONS = "STRAND <notifications@mystrand.co.uk>";
export const FROM_NOREPLY = "STRAND <noreply@mystrand.co.uk>";

export const SUPPORT_EMAIL = "info@teamtexture.co.uk";
