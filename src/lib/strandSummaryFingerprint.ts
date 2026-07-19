// Fingerprint of every data source that should invalidate a cached Strand
// Summary. Uses row counts + latest updated_at (or created_at) per table so
// any insert/update/delete flips the hash.

import { supabase } from "@/integrations/supabase/client";

const SUMMARY_PROMPT_VERSION = "no-scheduled-protein-v5";

function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

interface TableSpec {
  table: string;
  tsCol: string; // column to take MAX of
}

// Tables that should invalidate the summary when they change.
const TABLES: TableSpec[] = [
  { table: "wash_days", tsCol: "created_at" },
  { table: "journal_entries", tsCol: "created_at" },
  { table: "user_milestone_photos", tsCol: "created_at" },
  { table: "appointment_photos", tsCol: "created_at" },
  { table: "appointments", tsCol: "updated_at" },
  { table: "blood_results", tsCol: "updated_at" },
  { table: "user_hair_profile", tsCol: "updated_at" },
  { table: "user_style_profile", tsCol: "updated_at" },
  { table: "user_health_profile", tsCol: "updated_at" },
  { table: "user_goals", tsCol: "updated_at" },
  { table: "user_before_photos", tsCol: "created_at" },
];

export async function computeStrandSummaryFingerprint(userId: string): Promise<string> {
  const parts: string[] = [`prompt:${SUMMARY_PROMPT_VERSION}`];
  await Promise.all(
    TABLES.map(async ({ table, tsCol }) => {
      const { count } = await supabase
        // deno-lint-ignore no-explicit-any
        .from(table as any)
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      const { data } = await supabase
        // deno-lint-ignore no-explicit-any
        .from(table as any)
        .select(tsCol)
        .eq("user_id", userId)
        .order(tsCol, { ascending: false })
        .limit(1);
      const latest = (data?.[0] as unknown as Record<string, unknown> | undefined)?.[tsCol] ?? "";
      parts.push(`${table}:${count ?? 0}:${latest}`);
    }),
  );
  parts.sort();
  return djb2Hex(parts.join("|"));
}
