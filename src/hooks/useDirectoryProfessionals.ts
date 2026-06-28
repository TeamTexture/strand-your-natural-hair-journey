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
        // Column-level GRANT on professionals_directory restricts which
        // fields authenticated users can read (verification_number,
        // discount_code and verification_type are intentionally hidden).
        // SELECT * would fail with permission denied, wiping the DB-sourced
        // pros and leaving Book Now / Website buttons empty for those rows.
        const { data, error: dbErr } = await supabase
          .from("professionals_directory")
          .select(
            "id,name,title,type,clinic_name,address,postcode,instagram_handle,website_url,booking_url,bio,specialisms,discount_description,is_active,created_at",
          )
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
          // discount_code, verification_type and verification_number are
          // intentionally NOT granted to the authenticated role (security
          // hardening), so they're unavailable client-side. Default the
          // public-facing badge to "Specialist" and leave gmc/iot empty.
          const discount = row.discount_description ?? "";

          return {
            id: row.id,
            emoji,
            name: row.name,
            title: row.title,
            type,
            verified: "Specialist",
            clinic: row.clinic_name ?? row.name,
            location: row.postcode ?? row.address ?? "",
            specs: row.specialisms ?? [],
            bio: row.bio ?? "",
            insta,
            instaUrl,
            website: row.website_url ?? instaUrl,
            bookCode: "",
            discount,
            bookingUrl: row.booking_url ?? row.website_url ?? undefined,
            featured: true,
            gmcNumber: undefined,
            iotNumber: undefined,
          };
        });

        // Merge: DB rows win on name collisions. We normalise names by
        // lower-casing and stripping punctuation/whitespace so "Dr. Smith" and
        // "Dr Smith" collapse into the same person, then keep whichever entry
        // has the most populated profile (more filled fields = richer record).
        const norm = (s: string) =>
          s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const populationScore = (p: Professional) =>
          [p.bio, p.clinic, p.location, p.website, p.bookingUrl, p.discount, p.insta]
            .filter((v) => typeof v === "string" && v.trim().length > 0).length +
          (p.specs?.length ?? 0);

        const byKey = new Map<string, Professional>();
        for (const p of [...dbPros, ...PROFESSIONALS]) {
          const key = norm(p.name);
          const existing = byKey.get(key);
          if (!existing || populationScore(p) > populationScore(existing)) {
            byKey.set(key, p);
          }
        }
        const merged = Array.from(byKey.values());

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
