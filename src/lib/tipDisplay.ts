// Client mirror of the shared tip contract's presentation rules.
//
// Levels are PRESENTATION, not generation: the server always generates full
// detail, and the level decides how much is shown.
//   1 Minimal      headline + action + reason, one sentence each
//   2 Essential    headline + action + reason at full length
//   3 Hand-holding everything, plus extended
// Every level always shows an action and a reason.

export interface ContractTip {
  headline?: string | null;
  action?: string | null;
  reason?: string | null;
  extended?: string | null;
}

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A tip may only render its normal layout when BOTH action and reason exist. */
export const isRenderableTip = (tip: ContractTip | null | undefined): boolean =>
  !!tip && !!txt(tip.action) && !!txt(tip.reason);

const firstSentence = (s: string): string => {
  const t = txt(s);
  if (!t) return t;
  const m = t.match(/^[^.!?]*[.!?]/);
  return (m?.[0] ?? t).trim();
};

export function displayForLevel(tip: ContractTip, level: unknown): ContractTip {
  const lvl = Number(level) === 1 ? 1 : Number(level) === 3 ? 3 : 2;
  if (lvl === 1) {
    return {
      headline: txt(tip.headline),
      action: firstSentence(tip.action ?? ""),
      reason: firstSentence(tip.reason ?? ""),
    };
  }
  if (lvl === 2) {
    return {
      headline: txt(tip.headline),
      action: txt(tip.action),
      reason: txt(tip.reason),
    };
  }
  return {
    headline: txt(tip.headline),
    action: txt(tip.action),
    reason: txt(tip.reason),
    extended: txt(tip.extended) || undefined,
  };
}
