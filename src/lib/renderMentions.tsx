import React from "react";
import { Link } from "react-router-dom";

/** Render text with @mentions in orange and #hashtags as clickable links. Preserves line breaks. */
export function renderMentions(text: string | null | undefined): React.ReactNode {
  if (!text) return null;
  // Split on mentions OR hashtags, capturing them so we can style/link.
  const parts = text.split(/(@everyone\b|@[A-Za-z0-9_][A-Za-z0-9_ .'-]{0,30}?(?=[\s.,!?;:)]|$)|#[A-Za-z0-9_]{2,40})/g);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p === "@everyone") {
      return (
        <span key={i} className="rounded px-1 py-0.5 bg-orange-500/15 text-orange-600 font-semibold">
          @everyone
        </span>
      );
    }
    if (p.startsWith("@") && p.length > 1) {
      return (
        <span key={i} className="text-orange-600 font-semibold">{p}</span>
      );
    }
    if (p.startsWith("#") && p.length > 1) {
      const tag = p.slice(1).toLowerCase();
      return (
        <Link
          key={i}
          to={`/forum/tag/${encodeURIComponent(tag)}`}
          className="text-primary font-semibold hover:underline"
        >
          {p}
        </Link>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}
