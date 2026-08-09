// Readers for the analysis JSON saved on a tool by `tool-analyse-url`.
//
// The scan already stores a full personalised read (match score with its
// reasons, key features, how to use it, cautions and tips). The tool profile
// page used to hide almost all of it behind a dialog and depend on a fresh AI
// call, so the page looked empty whenever that call was slow or unavailable.
// These helpers surface the saved copy directly.

/** Model output occasionally leaks its own closing tags into a text field. */
export function cleanAnalysisText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const cut = v.split("<")[0];
  const text = cut.replace(/\s+/g, " ").trim();
  return text.length > 1 ? text : null;
}

export function analysisSentences(v: unknown, max = 6): string[] {
  const text = cleanAnalysisText(v);
  if (!text) return [];
  return (text.match(/[^.!?]+[.!?]?/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, max);
}

export function analysisStrings(v: unknown, max = 4): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => cleanAnalysisText(x))
    .filter((x): x is string => Boolean(x))
    .slice(0, max);
}

export interface AnalysisFeature {
  name: string;
  detail: string | null;
}

export function analysisFeatures(v: unknown, max = 4): AnalysisFeature[] {
  if (!Array.isArray(v)) return [];
  const out: AnalysisFeature[] = [];
  for (const raw of v) {
    if (typeof raw === "string") {
      const name = cleanAnalysisText(raw);
      if (name) out.push({ name, detail: null });
      continue;
    }
    if (raw && typeof raw === "object") {
      const rec = raw as Record<string, unknown>;
      const name = cleanAnalysisText(rec.name ?? rec.feature ?? rec.factor);
      if (!name) continue;
      out.push({ name, detail: cleanAnalysisText(rec.relevance ?? rec.reason ?? rec.detail) });
    }
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

export interface AnalysisScoreReason {
  factor: string;
  reason: string | null;
  direction: "plus" | "minus";
}

export function analysisScoreReasons(v: unknown, max = 4): AnalysisScoreReason[] {
  if (!Array.isArray(v)) return [];
  const out: AnalysisScoreReason[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    const factor = cleanAnalysisText(rec.factor ?? rec.name);
    if (!factor) continue;
    out.push({
      factor,
      reason: cleanAnalysisText(rec.reason ?? rec.detail),
      direction: rec.direction === "minus" ? "minus" : "plus",
    });
    if (out.length >= max) break;
  }
  return out;
}
