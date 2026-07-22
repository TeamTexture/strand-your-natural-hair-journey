import React from "react";

/** Render text with @mentions highlighted in gold. Preserves line breaks. */
export function renderMentions(text: string | null | undefined): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(@[A-Za-z0-9_][A-Za-z0-9_ .'-]{0,30}?)(?=[\s.,!?;:)]|$)/g);
  return parts.map((p, i) => {
    if (p.startsWith("@") && p.length > 1) {
      return (
        <span key={i} className="text-primary font-semibold">{p}</span>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}
