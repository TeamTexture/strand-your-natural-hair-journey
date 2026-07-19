// Local-cache store for blood values during onboarding / a new blood-test entry.
// Persists to localStorage immediately, then flushed to Supabase on Continue.
//
// Every completed entry becomes a new row in `blood_panels` so users can build
// a history of tests over time. A single onboarding pass writes to the SAME
// panel (via the "draft panel id" cache) even though multiple sub-screens
// (iron, thyroid, minerals, hormones) each call persistBloodValues().
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { evaluate, BLOOD_RANGES } from "@/data/bloodRanges";

const KEY = "strand_blood_values";
const UNKNOWN_KEY = "strand_blood_unknown";
const DRAFT_PANEL_KEY = "strand_blood_draft_panel_id";
const DRAFT_PANEL_DATE_KEY = "strand_blood_draft_panel_date";
const DRAFT_PANEL_LABEL_KEY = "strand_blood_draft_panel_label";

export interface UnknownMarker {
  marker: string;
  value: number | null;
  unit: string;
}

function readUnknown(): UnknownMarker[] {
  try {
    const raw = localStorage.getItem(UNKNOWN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getUnknownMarkers(): UnknownMarker[] {
  return readUnknown();
}

export function setUnknownMarkers(list: UnknownMarker[]) {
  localStorage.setItem(UNKNOWN_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("strand:blood-update"));
}

export function useUnknownMarkers() {
  const [list, setList] = useState<UnknownMarker[]>(() => readUnknown());
  useEffect(() => {
    const handler = () => setList(readUnknown());
    window.addEventListener("storage", handler);
    window.addEventListener("strand:blood-update", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("strand:blood-update", handler);
    };
  }, []);
  const update = useCallback((next: UnknownMarker[]) => {
    setUnknownMarkers(next);
    setList(next);
  }, []);
  return { unknown: list, setUnknown: update };
}


export type BloodValues = Record<string, number | null>;

function read(): BloodValues {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function write(v: BloodValues) {
  localStorage.setItem(KEY, JSON.stringify(v));
}

export function useBloodValues() {
  const [values, setValues] = useState<BloodValues>(() => read());

  // Cross-tab sync (and same-page updates via custom event)
  useEffect(() => {
    const handler = () => setValues(read());
    window.addEventListener("storage", handler);
    window.addEventListener("strand:blood-update", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("strand:blood-update", handler);
    };
  }, []);

  const setValue = useCallback((marker: string, value: number | null) => {
    setValues((prev) => {
      const next = { ...prev, [marker]: value };
      write(next);
      window.dispatchEvent(new Event("strand:blood-update"));
      return next;
    });
  }, []);

  return { values, setValue };
}

export function summariseValues(values: BloodValues, markers: string[]) {
  let entered = 0;
  let normal = 0;
  let flagged = 0;
  for (const m of markers) {
    const v = values[m];
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    entered += 1;
    const status = evaluate(m, v);
    if (status === "normal") normal += 1;
    else if (status === "low" || status === "high") flagged += 1;
  }
  return { entered, normal, flagged };
}

/** Clear both the working values AND the draft-panel pointer.
 *  Call when starting a brand-new blood-test entry. */
export function clearBloodDraft() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(UNKNOWN_KEY);
  localStorage.removeItem(DRAFT_PANEL_KEY);
  localStorage.removeItem(DRAFT_PANEL_DATE_KEY);
  localStorage.removeItem("strand_blood_summary_fp");
  window.dispatchEvent(new Event("strand:blood-update"));
}


/** Set the panel date for the current draft (before persisting).
 *  If not set, today's date is used. */
export function setDraftPanelDate(isoDate: string) {
  localStorage.setItem(DRAFT_PANEL_DATE_KEY, isoDate);
}

async function ensureDraftPanel(userId: string): Promise<string | null> {
  const existing = localStorage.getItem(DRAFT_PANEL_KEY);
  if (existing) {
    // Verify the panel still exists & belongs to this user
    const { data } = await supabase
      .from("blood_panels" as never)
      .select("id")
      .eq("id", existing)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return existing;
  }
  const panelDate =
    localStorage.getItem(DRAFT_PANEL_DATE_KEY) ??
    new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("blood_panels" as never)
    .insert({ user_id: userId, panel_date: panelDate } as never)
    .select("id")
    .single();
  if (error || !data) return null;
  const id = (data as { id: string }).id;
  localStorage.setItem(DRAFT_PANEL_KEY, id);
  return id;
}

export async function persistBloodValues() {
  const values = read();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return { ok: false, reason: "no_user" as const };

  const rows = Object.entries(values)
    .filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(v))
    .map(([marker, value]) => {
      const r = BLOOD_RANGES[marker];
      return {
        user_id: user.id,
        marker,
        value: value as number,
        unit: r?.unit ?? null,
        category: r?.category ?? null,
        status: evaluate(marker, value as number),
      };
    });
  // Include any "unknown" markers (extracted from a lab report but not in
  // our reference set). We store them so they show up in history too.
  const unknown = readUnknown()
    .filter((u) => u.value !== null && u.value !== undefined && !Number.isNaN(u.value))
    .map((u) => ({
      user_id: user.id,
      marker: u.marker,
      value: u.value as number,
      unit: u.unit || null,
      category: null as string | null,
      status: "untested" as const,
    }));

  const combined = [...rows, ...unknown];
  if (combined.length === 0) return { ok: true, count: 0 };

  const panelId = await ensureDraftPanel(user.id);
  if (!panelId) return { ok: false, reason: "panel_create_failed" as const };

  // Within the CURRENT draft panel, replace the markers we're about to write
  // (idempotent when the user re-visits a sub-step). Prior panels are left
  // untouched so history is preserved.
  await supabase
    .from("blood_results")
    .delete()
    .eq("user_id", user.id)
    .eq("panel_id" as never, panelId as never)
    .in(
      "marker",
      combined.map((r) => r.marker),
    );
  const rowsWithPanel = combined.map((r) => ({ ...r, panel_id: panelId } as never));
  const { error } = await supabase.from("blood_results").insert(rowsWithPanel);
  if (error) return { ok: false, reason: "insert_failed" as const, error };
  return { ok: true, count: combined.length, panelId };
}

