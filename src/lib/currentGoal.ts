/**
 * currentGoal — the ONE definition of "the member's current goal".
 *
 * `useGoals` and the AI context assembler both read it from here so there can
 * never be two competing ideas of which goal is live. A goal is current when
 * its status is "in_progress" (the default for legacy rows with no status) and
 * it has not been ended.
 */

export interface GoalLike {
  title?: string | null;
  challenges?: string[] | null;
  status?: string | null;
  ended_at?: string | null;
  created_at?: string | null;
}

/** True when this row is the member's live goal. */
export const isCurrentGoal = (g: GoalLike): boolean =>
  (g.status ?? "in_progress") === "in_progress" && !g.ended_at;

/** The single current goal from a list, newest first. Null when she has none. */
export function pickCurrentGoal<T extends GoalLike>(goals: readonly T[]): T | null {
  const active = goals.filter(isCurrentGoal);
  if (active.length === 0) return null;
  return (
    [...active].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null
  );
}
