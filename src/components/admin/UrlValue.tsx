import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

/**
 * Compact, non-overflowing display for a long URL.
 * Shows the domain plus a shortened tail, with copy + open actions.
 * The raw URL is never rendered, so UTM-laden links can't push the layout wide.
 */
const shorten = (raw: string) => {
  let host = raw;
  let tail = "";
  try {
    const u = new URL(raw);
    host = u.hostname.replace(/^www\./, "");
    tail = u.pathname === "/" ? "" : u.pathname;
    if (u.search) tail += u.search;
  } catch {
    return raw.length > 38 ? `${raw.slice(0, 26)}…${raw.slice(-8)}` : raw;
  }
  if (!tail) return host;
  if (tail.length > 18) tail = `${tail.slice(0, 12)}…`;
  return host + tail;
};

const UrlValue = ({ url, label }: { url?: string | null; label?: string }) => {
  const [copied, setCopied] = useState(false);
  const clean = (url ?? "").trim();
  if (!clean) {
    return <span className="italic text-muted-foreground">Not set</span>;
  }
  const href = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      toast.success(`${label ?? "Link"} copied`);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full align-middle">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={href}
        className="min-w-0 truncate text-primary underline underline-offset-2"
      >
        {shorten(href)}
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label ?? "link"}`}
        className="shrink-0 p-1 -m-0.5 text-muted-foreground hover:text-primary transition-colors"
      >
        {copied ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5" />}
      </button>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${label ?? "link"} in a new tab`}
        className="shrink-0 p-1 -m-0.5 text-muted-foreground hover:text-primary transition-colors"
      >
        <ExternalLink className="size-3.5" />
      </a>
    </span>
  );
};

export default UrlValue;
