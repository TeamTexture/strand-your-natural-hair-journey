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
 *
 * For LIVE pros (rows in `pro_profiles` with `is_published = true`) we also:
 *   • sign their avatar_path so the card renders their real photo
 *   • pull their currently-live pro_offer (if any) into the discount ribbon
 *   • surface their specialisms as tag chips (same shape as seed rows)
 */
export function useDirectoryProfessionals() {
  const [pros, setPros] = useState<Professional[]>(PROFESSIONALS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [{ data, error: dbErr }, { data: proProfiles, error: ppErr }] =
          await Promise.all([
            supabase
              .from("professionals_directory")
              .select(
                "id,name,title,type,clinic_name,address,postcode,instagram_handle,website_url,booking_url,bio,specialisms,discount_description,is_active,created_at",
              )
              .eq("is_active", true),
            supabase
              .from("pro_profiles")
              .select(
                "id,user_id,display_name,discipline,bio,services,specialisms,location,postcode,contact_email,booking_url,website_url,instagram_handle,avatar_path,is_published,suspended_at",
              )
              .eq("is_published", true)
              .is("suspended_at", null),
          ]);

        if (cancelled) return;
        if (dbErr) throw dbErr;
        if (ppErr) console.warn("pro_profiles load failed:", ppErr);

        // Sign live-pro avatars and pull any currently-active offer per pro
        // in parallel — both are best-effort and downgrade silently on error.
        const liveRows = proProfiles ?? [];
        const proIds = liveRows.map((r) => r.user_id).filter(Boolean);

        const avatarSigning = Promise.all(
          liveRows.map(async (row) => {
            if (!row.avatar_path) return [row.user_id, null] as const;
            const { data: signed } = await supabase.storage
              .from("pro-photos")
              .createSignedUrl(row.avatar_path, 3600);
            return [row.user_id, signed?.signedUrl ?? null] as const;
          }),
        );

        const offersQuery =
          proIds.length > 0
            ? supabase
                .from("pro_offers")
                .select("pro_user_id,title,code,starts_at,ends_at,is_active,created_at")
                .in("pro_user_id", proIds)
                .eq("is_active", true)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null } as const);

        const [avatarPairs, { data: offers }] = await Promise.all([
          avatarSigning,
          offersQuery,
        ]);
        if (cancelled) return;

        const avatarMap = new Map<string, string | null>(avatarPairs);
        // Pick the newest active offer per pro whose window is currently open.
        const nowMs = Date.now();
        const offerMap = new Map<string, { title: string; code: string | null }>();
        for (const o of offers ?? []) {
          const starts = o.starts_at ? new Date(o.starts_at).getTime() : -Infinity;
          const ends = o.ends_at ? new Date(o.ends_at).getTime() : Infinity;
          if (starts <= nowMs && ends >= nowMs && !offerMap.has(o.pro_user_id)) {
            offerMap.set(o.pro_user_id, { title: o.title, code: o.code ?? null });
          }
        }

        const dbPros: Professional[] = (data ?? []).map((row) => {
          const type = row.type as ProType;
          const emoji =
            type === "Trichologist" ? "🏥" : type === "Dermatologist" ? "🩺" : "✂️";
          const handle = normalizeInstagramHandle(row.instagram_handle);
          const insta = handle ? `@${handle}` : "";
          const instaUrl = instagramUrl(handle);
          const website = normalizeWebsiteUrl(row.website_url) || instaUrl;
          const booking = normalizeWebsiteUrl(row.booking_url) || normalizeWebsiteUrl(row.website_url) || undefined;
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
            website,
            bookCode: "",
            discount,
            bookingUrl: booking,
            featured: true,
            gmcNumber: undefined,
            iotNumber: undefined,
          };
        });

        // Live approved pros from pro_profiles.
        const livePros: Professional[] = liveRows.map((row) => {
          const t = row.discipline as string;
          const type: ProType =
            t === "Trichologist" || t === "Dermatologist"
              ? (t as ProType)
              : "Curl Specialist";
          const emoji =
            type === "Trichologist" ? "🏥" : type === "Dermatologist" ? "🩺" : "✂️";
          const handle = normalizeInstagramHandle(row.instagram_handle);
          const insta = handle ? `@${handle}` : "";
          const instaUrl = instagramUrl(handle);
          const website = normalizeWebsiteUrl(row.website_url) || instaUrl;
          const specialisms = (row.specialisms as string[] | null) ?? [];
          const offer = offerMap.get(row.user_id);
          const discount = offer
            ? offer.code
              ? `${offer.code} — ${offer.title}`
              : offer.title
            : "";
          return {
            id: row.id,
            emoji,
            name: row.display_name,
            title: t,
            type,
            verified: "Specialist",
            clinic: row.display_name,
            location: row.postcode ?? row.location ?? "",
            specs: specialisms,
            bio: row.bio ?? "",
            insta,
            instaUrl,
            website,
            bookCode: offer?.code ?? "",
            discount,
            bookingUrl: row.booking_url ?? row.website_url ?? undefined,
            featured: true,
            photoUrl: avatarMap.get(row.user_id) ?? undefined,
            gmcNumber: undefined,
            iotNumber: undefined,
            proUserId: row.user_id ?? undefined,
          };
        });

        const norm = (s: string) =>
          s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const populationScore = (p: Professional) =>
          [p.bio, p.clinic, p.location, p.website, p.bookingUrl, p.discount, p.insta]
            .filter((v) => typeof v === "string" && v.trim().length > 0).length +
          (p.specs?.length ?? 0);

        // Live pros take precedence, then curated DB rows, then static seed.
        const byKey = new Map<string, Professional>();
        for (const p of [...livePros, ...dbPros, ...PROFESSIONALS]) {
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
