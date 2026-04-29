/**
 * Generate a UUIDv4-compatible string that works in BOTH secure and insecure
 * contexts. Native crypto.randomUUID() is the preferred path (RFC4122-compliant,
 * cryptographically secure), but it's gated to secure contexts on iOS Safari.
 * Falls back to a Math.random-based v4 in insecure contexts so that local-IP
 * dev testing on mobile, plain-http previews, and embedded iframe contexts
 * don't crash. The fallback is NOT cryptographically secure — it's only used
 * for filename uniqueness, never for tokens or auth.
 */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
