import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PROFESSIONALS, type Professional, type ProType } from "@/data/professionals";

/**
 * Fetches the professionals_directory table from the backend and merges the
 * results into the curated static list. DB entries take precedence on id
 * collisions so editorial updates can override the static seed.
 *
 * Falls back gracefully to the static list if the network/DB call fails — the
 * directory is never empty.
 */
export function useDirectoryProfessionals() {
  const [pros, setPros] = useState<Professional[]>(PROFESSIONALS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data, error: dbErr } = await supabase
          .from("professionals_directory")
          .select("*")
          .eq("is_active", true);

        if (cancelled) return;
        if (dbErr) throw dbErr;

        const dbPros: Professional[] = (data ?? []).map((row) => {
          const type = row.type as ProType;
          const emoji =
            type === "Trichologist" ? "🏥" : type === "Dermatologist" ? "🩺" : "✂️";
          const insta = row.instagram_handle ? `@${row.instagram_handle}` : "";
          const instaUrl = row.instagram_handle
            ? `https://www.instagram.com/${row.instagram_handle}/`
            : "";
          const bookCode = row.discount_code ?? "";
          const discount =
            bookCode && row.discount_description
              ? `${bookCode} — ${row.discount_description}`
              : row.discount_description ?? "";

          return {
            id: row.id,
            emoji,
            name: row.name,
            title: row.title,
            type,
            verified: row.verification_type ?? "Specialist",
            clinic: row.clinic_name ?? row.name,
            location: row.postcode ?? row.address ?? "",
            specs: row.specialisms ?? [],
            bio: row.bio ?? "",
            insta,
            instaUrl,
            website: row.website_url ?? instaUrl,
            bookCode,
            discount,
            featured: true,
          };
        });

        // Merge: DB rows first (featured), then static rows that aren't duplicated by name.
        const dbNameSet = new Set(dbPros.map((p) => p.name.toLowerCase()));
        const merged = [
          ...dbPros,
          ...PROFESSIONALS.filter((p) => !dbNameSet.has(p.name.toLowerCase())),
        ];

        setPros(merged);
        setError(null);
      } catch (e) {
        console.error("useDirectoryProfessionals load failed:", e);
        if (!cancelled) setError("Could not load latest directory");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { pros, loading, error };
}
