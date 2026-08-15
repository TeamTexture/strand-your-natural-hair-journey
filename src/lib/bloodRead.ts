// Canonical blood-data read path.
//
// WHY THIS EXISTS (2026-08-15). Three surfaces used to read blood data three
// different ways and disagreed about the same member:
//   • NutritionPlan.tsx  — `blood_results` unscoped, and flagged a marker only
//                          when it evaluated "low" (every HIGH result was
//                          silently discarded).
//   • Home.tsx           — `blood_panels` filtered to status = 'logged'.
//   • aiContext.ts       — the 3 most recent `blood_panels` with NO status
//                          filter, so scheduled (empty) panels could occupy
//                          all three slots and starve the AI of results.
//
// One reader now serves all three. The rules:
//   1. Only `status = 'logged'` panels count. A scheduled panel is an
//      appointment, not a result, and must never occupy a panel slot.
//   2. Results are scoped to those panels. If a member has no logged panels
//      at all, fall back to their unscoped rows (accounts predating panels).
//   3. A marker is FLAGGED when it is low OR high. A high marker is clinically
//      relevant and must never be invisible to guidance.
//   4. The stored `status` column is trusted when present; otherwise the
//      marker is evaluated against BLOOD_RANGES.
//
// This module never writes. It is a read/derive path only.

import { supabase } from "@/integrations/supabase/client";
import { evaluate, type BloodStatus } from "@/data/bloodRanges";

export interface BloodPanelRow {
  id: string;
  panel_date: string | null;
  label: string | null;
}

export interface BloodResultRow {
  marker: string;
  value: number | null;
  unit: string | null;
  status: string | null;
  category: string | null;
  panel_id: string | null;
}

export interface BloodRead {
  /** Logged panels only, most recent first. */
  panels: BloodPanelRow[];
  /** Results belonging to `panels` (or all rows when the member has none). */
  results: BloodResultRow[];
  /** Markers that are low OR high, de-duplicated, most recent panel first. */
  flagged: string[];
  /** Marker → resolved status, for callers that need the direction. */
  statusByMarker: Map<string, BloodStatus>;
}

/** Resolve a row's status: trust the stored value, else evaluate the range. */
export const resolveStatus = (row: {
  marker: string;
  value: number | null;
  status?: string | null;
}): BloodStatus => {
  const stored = (row.status ?? "").toLowerCase();
  if (stored === "low" || stored === "high" || stored === "normal" || stored === "untested") {
    return stored as BloodStatus;
  }
  return evaluate(row.marker, row.value);
};

/** True when a marker should be treated as clinically notable (low OR high). */
export const isFlagged = (status: BloodStatus) => status === "low" || status === "high";

/**
 * Read a member's blood data.
 *
 * @param userId the member whose data to read. Callers MUST pass an
 *   authenticated user id — never read blood data without one, or the query
 *   silently returns zero rows and every downstream surface looks empty.
 * @param opts.panelLimit cap the number of logged panels (default: all).
 */
export async function readBloodData(
  userId: string,
  opts: { panelLimit?: number } = {},
): Promise<BloodRead> {
  const empty: BloodRead = {
    panels: [],
    results: [],
    flagged: [],
    statusByMarker: new Map(),
  };
  if (!userId) return empty;

  let panelQuery = supabase
    .from("blood_panels")
    .select("id, panel_date, label")
    .eq("user_id", userId)
    .eq("status", "logged")
    .order("panel_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts.panelLimit) panelQuery = panelQuery.limit(opts.panelLimit);

  const { data: panelData } = await panelQuery;
  const panels = ((panelData ?? []) as BloodPanelRow[]).filter((p) => !!p.id);

  const select = "marker, value, unit, status, category, panel_id";
  let resultRows: BloodResultRow[] = [];
  if (panels.length > 0) {
    const { data } = await supabase
      .from("blood_results")
      .select(select)
      .eq("user_id", userId)
      .in("panel_id", panels.map((p) => p.id));
    resultRows = (data ?? []) as BloodResultRow[];
  } else {
    // Legacy accounts predating the panels migration.
    const { data } = await supabase
      .from("blood_results")
      .select(select)
      .eq("user_id", userId);
    resultRows = (data ?? []) as BloodResultRow[];
  }

  // Flagged markers, in panel order so the most recent reading wins.
  const order = new Map(panels.map((p, i) => [p.id, i]));
  const sorted = [...resultRows].sort(
    (a, b) => (order.get(a.panel_id ?? "") ?? 99) - (order.get(b.panel_id ?? "") ?? 99),
  );
  const statusByMarker = new Map<string, BloodStatus>();
  const flagged: string[] = [];
  sorted.forEach((row) => {
    if (statusByMarker.has(row.marker)) return;
    const status = resolveStatus(row);
    statusByMarker.set(row.marker, status);
    if (isFlagged(status)) flagged.push(row.marker);
  });

  return { panels, results: resultRows, flagged, statusByMarker };
}
