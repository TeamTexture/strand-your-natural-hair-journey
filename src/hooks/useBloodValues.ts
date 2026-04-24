// Local-cache store for blood values during onboarding.
// Persists to localStorage immediately, then flushed to Supabase on Continue.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { evaluate, BLOOD_RANGES } from "@/data/bloodRanges";

const KEY = "strand_blood_values";

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
  if (rows.length === 0) return { ok: true, count: 0 };

  // Replace existing for these markers (simple approach: delete then insert)
  await supabase
    .from("blood_results")
    .delete()
    .eq("user_id", user.id)
    .in("marker", rows.map((r) => r.marker));
  const { error } = await supabase.from("blood_results").insert(rows);
  if (error) return { ok: false, reason: "insert_failed" as const, error };
  return { ok: true, count: rows.length };
}
