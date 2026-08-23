// Local-cache store for blood values during onboarding / a new blood-test entry.
// Persists to localStorage immediately, mirrors to `public.onboarding_drafts` so
// a part-finished entry survives a new device or a weeks-long gap while the
// member actually gets their test done, then flushes to blood_panels /
// blood_results on Continue.
//
// Every completed entry becomes a new row in `blood_panels` so users can build
// a history of tests over time. A single onboarding pass writes to the SAME
// panel (via the "draft panel id" cache) even though multiple sub-screens
// (iron, thyroid, minerals, hormones) each call persistBloodValues().
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { evaluate, BLOOD_RANGES } from "@/data/bloodRanges";
import {
  deleteRemoteDraft,
  loadRemoteDraft,
  readLocalDraftTime,
  saveRemoteDraft,
  writeLocalDraftTime,
} from "@/lib/onboardingDraftStore";

const KEY = "strand_blood_values";
const UNKNOWN_KEY = "strand_blood_unknown";
const DRAFT_PANEL_KEY = "strand_blood_draft_panel_id";
const DRAFT_PANEL_DATE_KEY = "strand_blood_draft_panel_date";
const DRAFT_PANEL_LABEL_KEY = "strand_blood_draft_panel_label";
const DRAFT_PANEL_TEST_TYPE_KEY = "strand_blood_draft_panel_test_type";
const DRAFT_PANEL_LAB_NAME_KEY = "strand_blood_draft_panel_lab_name";
const DRAFT_PANEL_THUMB_KEY = "strand_blood_draft_panel_thumb";
const STEP_KEY = "strand_blood_draft_step";

/** Draft key for the whole blood-entry flow in `public.onboarding_drafts`. */
export const BLOOD_DRAFT_KEY = "blood-entry";

const PANEL_META_KEYS = [
  DRAFT_PANEL_KEY,
  DRAFT_PANEL_DATE_KEY,
  DRAFT_PANEL_LABEL_KEY,
  DRAFT_PANEL_TEST_TYPE_KEY,
  DRAFT_PANEL_LAB_NAME_KEY,
  DRAFT_PANEL_THUMB_KEY,
  STEP_KEY,
] as const;

function snapshotBloodDraft(): Record<string, unknown> {
  const meta: Record<string, string> = {};
  for (const k of PANEL_META_KEYS) {
    const v = localStorage.getItem(k);
    if (v) meta[k] = v;
  }
  return {
    values: localStorage.getItem(KEY) ?? "{}",
    unknown: localStorage.getItem(UNKNOWN_KEY) ?? "[]",
    meta,
  };
}

/** Mirror the current local blood draft to the database (debounced). */
export function syncBloodDraft(): void {
  writeLocalDraftTime(BLOOD_DRAFT_KEY);
  saveRemoteDraft(BLOOD_DRAFT_KEY, snapshotBloodDraft());
}

/** Remember which blood screen the member was last on, so resume lands there. */
export function setBloodDraftStep(path: string): void {
  try {
    if (localStorage.getItem(STEP_KEY) === path) return;
    localStorage.setItem(STEP_KEY, path);
  } catch {
    /* quota / private mode */
  }
  syncBloodDraft();
}

export function getBloodDraftStep(): string | null {
  try {
    return localStorage.getItem(STEP_KEY);
  } catch {
    return null;
  }
}

/**
 * Pull the durable copy of the blood draft onto this device.
 *
 * Only overwrites local state when the saved copy is newer than what this
 * device last wrote, so an in-progress entry is never clobbered.
 */
export async function hydrateBloodDraft(): Promise<boolean> {
  const localTime = readLocalDraftTime(BLOOD_DRAFT_KEY);
  const remote = await loadRemoteDraft(BLOOD_DRAFT_KEY);
  if (!remote) return false;
  if (localTime && remote.updatedAt <= localTime) return false;
  const payload = remote.payload as {
    values?: unknown;
    unknown?: unknown;
    meta?: Record<string, unknown>;
  };
  try {
    if (typeof payload.values === "string") localStorage.setItem(KEY, payload.values);
    if (typeof payload.unknown === "string") localStorage.setItem(UNKNOWN_KEY, payload.unknown);
    for (const k of PANEL_META_KEYS) {
      const v = payload.meta?.[k];
      if (typeof v === "string" && v) localStorage.setItem(k, v);
      else localStorage.removeItem(k);
    }
    writeLocalDraftTime(BLOOD_DRAFT_KEY, new Date(remote.updatedAt || Date.now()).toISOString());
  } catch {
    return false;
  }
  window.dispatchEvent(new Event("strand:blood-update"));
  return true;
}


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
  syncBloodDraft();
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
  // Auto-save: every typed marker persists on its own, no "save" tap needed.
  syncBloodDraft();
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
  localStorage.removeItem(DRAFT_PANEL_LABEL_KEY);
  localStorage.removeItem(DRAFT_PANEL_TEST_TYPE_KEY);
  localStorage.removeItem(DRAFT_PANEL_LAB_NAME_KEY);
  localStorage.removeItem(DRAFT_PANEL_THUMB_KEY);
  localStorage.removeItem("strand_blood_summary_fp");
  localStorage.removeItem(STEP_KEY);
  void deleteRemoteDraft(BLOOD_DRAFT_KEY);
  window.dispatchEvent(new Event("strand:blood-update"));
}


/** Set the panel date for the current draft (before persisting).
 *  If not set, today's date is used. */
export function setDraftPanelDate(isoDate: string) {
  localStorage.setItem(DRAFT_PANEL_DATE_KEY, isoDate);
  syncBloodDraft();
}

/** Set the human-readable label for the current draft panel (extracted from
 *  the uploaded document itself — e.g. "Advanced Thyroid Blood Test — Medichecks"). */
export function setDraftPanelLabel(label: string | null) {
  if (label && label.trim()) {
    localStorage.setItem(DRAFT_PANEL_LABEL_KEY, label.trim());
  } else {
    localStorage.removeItem(DRAFT_PANEL_LABEL_KEY);
  }
  syncBloodDraft();
}

/** Test type / category as printed on the report (e.g. "Thyroid function"). */
export function setDraftPanelTestType(testType: string | null) {
  if (testType && testType.trim()) {
    localStorage.setItem(DRAFT_PANEL_TEST_TYPE_KEY, testType.trim());
  } else {
    localStorage.removeItem(DRAFT_PANEL_TEST_TYPE_KEY);
  }
  syncBloodDraft();
}

/** Lab/brand that ran the test (e.g. "Medichecks", "Thriva"). */
export function setDraftPanelLabName(labName: string | null) {
  if (labName && labName.trim()) {
    localStorage.setItem(DRAFT_PANEL_LAB_NAME_KEY, labName.trim());
  } else {
    localStorage.removeItem(DRAFT_PANEL_LAB_NAME_KEY);
  }
  syncBloodDraft();
}

/** Storage path (bucket "blood-panel-thumbs") for the panel's source-doc thumbnail. */
export function setDraftPanelThumbnail(path: string | null) {
  if (path && path.trim()) {
    localStorage.setItem(DRAFT_PANEL_THUMB_KEY, path.trim());
  } else {
    localStorage.removeItem(DRAFT_PANEL_THUMB_KEY);
  }
  syncBloodDraft();
}

async function ensureDraftPanel(userId: string): Promise<string | null> {
  const label = localStorage.getItem(DRAFT_PANEL_LABEL_KEY);
  const testType = localStorage.getItem(DRAFT_PANEL_TEST_TYPE_KEY);
  const labName = localStorage.getItem(DRAFT_PANEL_LAB_NAME_KEY);
  const thumb = localStorage.getItem(DRAFT_PANEL_THUMB_KEY);
  const existing = localStorage.getItem(DRAFT_PANEL_KEY);
  const metaUpdate: Record<string, unknown> = {};
  if (label) metaUpdate.label = label;
  if (testType) metaUpdate.test_type = testType;
  if (labName) metaUpdate.lab_name = labName;
  if (thumb) metaUpdate.thumbnail_path = thumb;

  if (existing) {
    const { data } = await supabase
      .from("blood_panels" as never)
      .select("id")
      .eq("id", existing)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      if (Object.keys(metaUpdate).length > 0) {
        await supabase
          .from("blood_panels" as never)
          .update(metaUpdate as never)
          .eq("id", existing)
          .eq("user_id", userId);
      }
      return existing;
    }
  }
  const panelDate =
    localStorage.getItem(DRAFT_PANEL_DATE_KEY) ??
    new Date().toISOString().slice(0, 10);
  const insertRow: Record<string, unknown> = { user_id: userId, panel_date: panelDate, ...metaUpdate };
  const { data, error } = await supabase
    .from("blood_panels" as never)
    .insert(insertRow as never)
    .select("id")
    .single();
  if (error || !data) {
    // Surface to console — the onboarding blood flow was silently blocked
    // when this failed (RLS or validation). Callers can decide to toast.
    console.error("[blood_panels] draft insert failed", error);
    return null;
  }
  const id = (data as { id: string }).id;
  localStorage.setItem(DRAFT_PANEL_KEY, id);
  syncBloodDraft();
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

  // Never delete the saved copy before its replacement exists. Tablet/mobile
  // connections can drop between requests; deleting first made an interrupted
  // retry remove blood work that had already been saved.
  const markers = combined.map((r) => r.marker);
  const { data: previousRows, error: previousRowsError } = await supabase
    .from("blood_results")
    .select("id")
    .eq("user_id", user.id)
    .eq("panel_id" as never, panelId as never)
    .in("marker", markers);
  if (previousRowsError) {
    return { ok: false, reason: "existing_results_read_failed" as const, error: previousRowsError };
  }

  const rowsWithPanel = combined.map((r) => ({ ...r, panel_id: panelId } as never));
  const { error } = await supabase.from("blood_results").insert(rowsWithPanel);
  if (error) return { ok: false, reason: "insert_failed" as const, error };

  const previousIds = (previousRows ?? []).map((row) => row.id);
  if (previousIds.length > 0) {
    const { error: cleanupError } = await supabase
      .from("blood_results")
      .delete()
      .eq("user_id", user.id)
      .eq("panel_id" as never, panelId as never)
      .in("id", previousIds);
    // The new rows are already safe. A failed cleanup may briefly leave duplicate
    // history rows, but must not make the save look failed or prompt another write.
    if (cleanupError) console.warn("[blood_results] previous-row cleanup failed", cleanupError);
  }
  return { ok: true, count: combined.length, panelId };
}

