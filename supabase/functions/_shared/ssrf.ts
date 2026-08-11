// SSRF guard for edge functions that fetch caller-supplied URLs.
//
// Blocks non-http(s) schemes, credentials in the URL, non-standard ports, and
// any host that resolves to a loopback / private / link-local / metadata
// address. DNS resolution is attempted when the runtime exposes it; when it
// does not, literal-IP and known-internal hostname checks still apply.

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^192\.0\.0\./,
  /^198\.1[89]\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^2(2[4-9]|3\d)\./, // multicast
  /^2(4[0-9]|5[0-5])\./, // reserved
];

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
  ".cluster.local",
];

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "kubernetes.default",
]);

const ALLOWED_PORTS = new Set(["", "80", "443"]);

function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_V4.some((re) => re.test(ip));
}

function isPrivateIpv6(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "").toLowerCase();
  if (ip === "::" || ip === "::1") return true;
  // Unique-local (fc00::/7), link-local (fe80::/10).
  if (/^f[cd]/.test(ip) || /^fe[89ab]/.test(ip)) return true;
  // IPv4-mapped / NAT64 forms — fall through to the v4 test.
  const mapped = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

const isIpv4 = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

/**
 * Returns a parsed URL that is safe to fetch server-side, or an error message.
 */
export async function assertPublicHttpUrl(
  raw: string,
): Promise<{ url: URL } | { error: string }> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "Invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "URL must be http(s)" };
  }
  if (url.username || url.password) {
    return { error: "URL must not contain credentials" };
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    return { error: "URL port is not allowed" };
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return { error: "URL host is not allowed" };
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { error: "URL host is not allowed" };
  }
  if (isIpv4(host) && isPrivateIpv4(host)) {
    return { error: "URL host is not allowed" };
  }
  if (host.includes(":") && isPrivateIpv6(host)) {
    return { error: "URL host is not allowed" };
  }
  if (isIpv4(host) || host.includes(":")) return { url };

  // Resolve the hostname when the runtime allows it, so a public name that
  // points at a private address is rejected too.
  const resolveDns = (Deno as unknown as {
    resolveDns?: (h: string, t: string) => Promise<string[]>;
  }).resolveDns;
  if (typeof resolveDns === "function") {
    const records: string[] = [];
    for (const type of ["A", "AAAA"]) {
      try {
        records.push(...(await resolveDns(host, type)));
      } catch {
        /* no records of this type, or DNS unavailable */
      }
    }
    for (const ip of records) {
      if (isIpv4(ip) ? isPrivateIpv4(ip) : isPrivateIpv6(ip)) {
        return { error: "URL host is not allowed" };
      }
    }
  }

  return { url };
}
