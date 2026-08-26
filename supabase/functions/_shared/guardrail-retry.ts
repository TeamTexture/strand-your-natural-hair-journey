export const MAX_REJECTION_ATTEMPTS = 3;

export function makeGenerationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `gen-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function retryReasonFromRules(rules: string[] | null | undefined): string | null {
  if (!rules || rules.length === 0) return null;
  return `guardrail_rejection:${[...new Set(rules)].slice(0, 8).join(",")}`;
}

export function buildRejectionRetryInstruction(
  rules: string[] | null | undefined,
  surface: string,
): string {
  const unique = [...new Set(rules ?? [])].filter(Boolean);
  if (unique.length === 0) return "";
  return [
    `RETRY — the previous ${surface} generation was rejected by server guardrails.`,
    "Regenerate from the same evidence and member facts, fixing every rejection below.",
    "Do not relax safety rules, do not add new claims, and keep the same output schema.",
    `Rejected rules: ${unique.join(", ")}.`,
  ].join("\n");
}