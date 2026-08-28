import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PROFESSIONALS,
  type Professional,
  type ProType,
  type ProService,
  type ProOfferView,
} from "@/data/professionals";
import { normalizeInstagramHandle, instagramUrl, normalizeWebsiteUrl } from "@/lib/socialLinks";

/**
 * THE directory source of truth.
 *
 * Three layers, highest wins:
 *   2. LIVE pros   — `pro_profiles` rows with is_published = true and no
 *                    suspension. These are the professionals' own saved
 *                    profiles, read live, so an edit saved in /pro/profile
 *                    shows on the card and public profile immediately.
 *   1. CURATED DB  — admin-managed `professionals_directory` rows (is_active).
 *   0. STATIC SEED — the editorial cheat-sheet in src/data/professionals.ts.
 *
 * A live pro is NEVER filtered, renamed away, or shadowed by a seed row:
 *  • identity is keyed on `pro_profiles.id` (not their display name and not
 *    the login, which a salon stylist does not have), so renaming a profile
 *    can't split it into two cards or drop it from the listing;
 *  • the editorial allowlist applies ONLY to the static seed — it must never
 *    gate real professionals who have paid for and published a listing;
 *  • seed / curated rows for the same person (matched on normalised name) are
 *    dropped so the live profile isn't duplicated by a stale snapshot.
 *
 * Cached under ["pro_directory"] — invalidate that key after any profile write
 * (see src/pages/pro/ProProfile.tsx) and the directory repaints at once.
 */

/** Editorial curation for the STATIC SEED ONLY. Live pros are never gated. */
const SEED_ALLOWED_NAMES = ["yvonneabimbola", "ericaliburd", "paigelewin"];
const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const isSeedAllowed = (name: string) =>
  SEED_ALLOWED_NAMES.some((a) => norm(name).includes(a));

export const PRO_DIRECTORY_KEY = ["pro_directory"] as const;

const PRO_TYPES: ProType[] = [
  "Trichologist",
  "Dermatologist",
  "Curl Specialist",
  "Colourist",
  "Stylist",
];

const typeFor = (discipline: string | null | undefined): ProType =>
  PRO_TYPES.includes(discipline as ProType) ? (discipline as ProType) : "Curl Specialist";

const emojiFor = (type: ProType) =>
  type === "Trichologist" ? "🏥" : type === "Dermatologist" ? "🩺" : "✂️";

type SalonRow = {
  id: string;
  name: string;
  city: string | null;
  postcode: string | null;
  business_phone: string | null;
  business_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  opening_hours: unknown;
  is_published: boolean;
};

/**
 * Discount codes are commercial member benefits and are never readable by a
 * visitor who is not signed in (enforced in the database with column-level
 * privileges). Signed-out visitors therefore load the listing columns only.
 */
const PRO_LISTING_COLUMNS =
  "id,user_id,salon_id,display_name,discipline,bio,services,specialisms,location,postcode,contact_email,booking_url,website_url,instagram_handle,avatar_path,photos,is_published,suspended_at,business_phone,business_email,address_line1,address_line2,city,opening_hours,listing_tier,referral_fee_percent,qualifications,is_doctor_verified,can_take_bloods_verified,bloods_setting,profile_review_status,featured_from,featured_until,featured_rank";
const PRO_DISCOUNT_COLUMNS = "discount_code,discount_description,discount_active";

/**
 * FEATURED SLOT — a reusable, time-bound promoted placement. No professional is
 * ever named in code: the slot is whoever the admin has dated into it today.
 *
 * Featured requires: published + review status approved + today inside the
 * window (inclusive). A null `featured_from` means "already started" and a null
 * `featured_until` means "no end date", but ONLY when the other bound is set —
 * a row with all three fields null is never featured, so the slot can't switch
 * itself on for the whole directory.
 */
export function isFeaturedToday(
  row: {
    is_published?: boolean | null;
    profile_review_status?: string | null;
    featured_from?: string | null;
    featured_until?: string | null;
  },
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (row.is_published !== true) return false;
  if (row.profile_review_status !== "approved") return false;
  const from = row.featured_from ?? null;
  const until = row.featured_until ?? null;
  if (!from && !until) return false;
  if (from && today < from) return false;
  if (until && today > until) return false;
  return true;
}


async function loadDirectory(): Promise<Professional[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const authed = !!sessionData.session;
  const proColumns = authed
    ? `${PRO_LISTING_COLUMNS},${PRO_DISCOUNT_COLUMNS}`
    : PRO_LISTING_COLUMNS;

  const [{ data: curated, error: dbErr }, { data: proProfiles, error: ppErr }] =
    await Promise.all([
      supabase
        .from("professionals_directory")
        .select(
          "id,name,title,type,clinic_name,address,postcode,instagram_handle,website_url,booking_url,bio,specialisms,discount_description,is_active,created_at,listing_tier,referral_fee_percent",
        )
        .eq("is_active", true),
      supabase
        .from("pro_profiles")
        // Cast keeps the generated row typing while the column list stays dynamic.
        .select(proColumns as "*")
        .eq("is_published", true)
        .is("suspended_at", null),
    ]);


  // The CURATED layer may never take the live layer down: a grant/policy gap
  // there once collapsed the whole query, so it degrades silently.
  if (dbErr) console.warn("professionals_directory load failed:", dbErr);
  // The LIVE layer is the directory. If it fails we must FAIL LOUDLY — a
  // silent partial result previously left members looking at the two static
  // seed cards (Yvonne + Erica) believing that was the whole directory.
  if (ppErr) {
    console.error("pro_profiles load failed:", ppErr);
    throw new Error(ppErr.message || "Could not load professionals");
  }


  // A listing is reachable if it has its own login OR belongs to a salon (in
  // which case the salon owner's login answers for it). Rows with neither are
  // orphans and must never be listed — nobody could answer an enquiry.
  const candidateRows = (proProfiles ?? []).filter((r) => !!r.user_id || !!r.salon_id);

  const salonIds = Array.from(
    new Set(candidateRows.map((r) => r.salon_id).filter((id): id is string => !!id)),
  );
  const { data: salonRows } = salonIds.length
    ? await supabase
        .from("salons")
        .select(
          "id,name,city,postcode,business_phone,business_email,address_line1,address_line2,opening_hours,is_published",
        )
        .in("id", salonIds)
    : { data: [] as SalonRow[] };

  const salonMap = new Map<string, SalonRow>(
    ((salonRows ?? []) as SalonRow[]).filter((s) => s.is_published).map((s) => [s.id, s]),
  );

  // A stylist with no login only exists through her salon: if the salon isn't
  // published, she isn't listed.
  const liveRows = candidateRows.filter(
    (r) => !!r.user_id || (r.salon_id && salonMap.has(r.salon_id)),
  );

  // Avatars keyed on the LISTING id, not the login — one login can own several
  // stylist listings inside a salon.
  const avatarSigning = Promise.all(
    liveRows.map(async (row) => {
      if (!row.avatar_path) return [row.id as string, null] as const;
      const { data: signed } = await supabase.storage
        .from("pro-photos")
        .createSignedUrl(row.avatar_path, 3600);
      return [row.id as string, signed?.signedUrl ?? null] as const;
    }),
  );

  // The professional's own work gallery. It lives in a private bucket, so the
  // paths have to be signed here — without this a pro who has uploaded photos
  // still shows a bare listing. Capped so a large gallery can't stall the load.
  const gallerySigning = Promise.all(
    liveRows.map(async (row) => {
      const paths = ((row.photos as string[] | null) ?? []).filter(Boolean).slice(0, 8);
      if (paths.length === 0) return [row.id as string, [] as string[]] as const;
      const { data: signed } = await supabase.storage
        .from("pro-photos")
        .createSignedUrls(paths, 3600);
      const urls = (signed ?? [])
        .map((s) => s.signedUrl)
        .filter((u): u is string => !!u);
      return [row.id as string, urls] as const;
    }),
  );

  const proIds = Array.from(
    new Set(liveRows.map((r) => r.user_id).filter((id): id is string => !!id)),
  );

  const offersQuery =
    proIds.length > 0
      ? supabase
          .from("pro_offers")
          .select("pro_user_id,title,description,code,starts_at,ends_at,is_active,created_at")
          .in("pro_user_id", proIds)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as const);

  const [avatarPairs, galleryPairs, { data: offers }] = await Promise.all([
    avatarSigning,
    gallerySigning,
    offersQuery,
  ]);

  const avatarMap = new Map<string, string | null>(avatarPairs);
  const galleryMap = new Map<string, string[]>(galleryPairs);
  const nowMs = Date.now();
  // EVERY live offer per pro, newest first — a pro running three campaigns has
  // all three shown, not just the newest one.
  const offerMap = new Map<string, ProOfferView[]>();
  for (const o of (offers ?? []) as Array<Record<string, unknown>>) {
    const proUserId = o.pro_user_id as string;
    const starts = o.starts_at ? new Date(o.starts_at as string).getTime() : -Infinity;
    const ends = o.ends_at ? new Date(o.ends_at as string).getTime() : Infinity;
    if (starts > nowMs || ends < nowMs) continue;
    const list = offerMap.get(proUserId) ?? [];
    list.push({
      title: o.title as string,
      description: (o.description as string | null) ?? null,
      code: (o.code as string | null) ?? null,
      endsAt: (o.ends_at as string | null) ?? null,
    });
    offerMap.set(proUserId, list);
  }

  // ── Live pros — the professional's own current saved profile.
  const livePros: Professional[] = liveRows.map((row) => {
    const type = typeFor(row.discipline as string);
    const handle = normalizeInstagramHandle(row.instagram_handle);
    const instaUrl = instagramUrl(handle);
    const salon = row.salon_id ? salonMap.get(row.salon_id) ?? null : null;
    const isSalonStylist = !row.user_id;
    // Salon-managed stylists carry their own discount on the profile row; solo
    // pros keep using their pro_offers campaigns.
    const ownDiscount: ProOfferView | null =
      row.discount_active && row.discount_code
        ? {
            title: row.discount_description ?? "Discount available",
            code: row.discount_code as string,
          }
        : null;
    const offerList: ProOfferView[] = row.user_id
      ? offerMap.get(row.user_id as string) ?? (ownDiscount ? [ownDiscount] : [])
      : ownDiscount
        ? [ownDiscount]
        : [];
    const offer = offerList[0] ?? null;
    // Services live on the professional's own listing row — rendered verbatim.
    const serviceList: ProService[] = Array.isArray(row.services)
      ? (row.services as unknown as ProService[]).filter(
          (s) => s && typeof s.name === "string" && s.name.trim().length > 0,
        )
      : [];

    // Address and hours live at salon level so two stylists in one building can
    // never drift apart.
    const addressLine1 = salon?.address_line1 ?? row.address_line1;
    const addressLine2 = salon?.address_line2 ?? row.address_line2;
    const city = salon?.city ?? row.city;
    const openingHours = (salon?.opening_hours ?? row.opening_hours) as
      | Professional["openingHours"]
      | null;
    return {
      id: row.id,
      emoji: emojiFor(type),
      name: row.display_name,
      title: (row.discipline as string) ?? type,
      type,
      verified: "Specialist",
      clinic: salon?.name ?? row.display_name,
      location: salon?.postcode ?? row.postcode ?? row.location ?? "",
      specs: (row.specialisms as string[] | null) ?? [],
      bio: row.bio ?? "",
      insta: handle ? `@${handle}` : "",
      instaUrl,
      website: normalizeWebsiteUrl(row.website_url) || instaUrl,
      bookCode: offer?.code ?? "",
      discount: offer ? (offer.code ? `${offer.code} — ${offer.title}` : offer.title) : "",
      bookingUrl: row.booking_url ?? row.website_url ?? undefined,
      featured: true,
      photoUrl: avatarMap.get(row.id as string) ?? undefined,
      galleryUrls: galleryMap.get(row.id as string) ?? [],
      proUserId: (row.user_id as string | null) ?? undefined,
      proProfileId: row.id as string,
      salonId: row.salon_id ?? null,
      salonName: salon?.name ?? null,
      salonCity: salon?.city ?? null,
      isSalonStylist,
      services: serviceList,
      offers: offerList,

      listingTier: (row.listing_tier as Professional["listingTier"]) ?? "full",
      referralFeePercent:
        row.referral_fee_percent != null ? Number(row.referral_fee_percent) : null,
      businessPhone: salon?.business_phone ?? row.business_phone ?? undefined,
      businessEmail: salon?.business_email ?? row.business_email ?? undefined,
      addressLine1: addressLine1 ?? undefined,
      addressLine2: addressLine2 ?? undefined,
      city: city ?? undefined,
      openingHours: openingHours ?? undefined,
      qualifications: (row.qualifications as string[] | null) ?? undefined,
      // VERIFIED state only — a claim never reaches the directory.
      isDoctorVerified: row.is_doctor_verified === true,
      canTakeBloodsVerified: row.can_take_bloods_verified === true,
      bloodsSetting: (row.bloods_setting as Professional["bloodsSetting"]) ?? null,
      // Promoted, time-bound featured slot — recomputed on every load, so an
      // expired window drops out of the slot by itself.
      isFeaturedSlot: isFeaturedToday(row as Parameters<typeof isFeaturedToday>[0]),
      featuredSlotRank:
        row.featured_rank != null ? Number(row.featured_rank) : null,
    };

  });

  // ── Admin-curated directory rows.
  const curatedPros: Professional[] = (curated ?? []).map((row) => {
    const type = row.type as ProType;
    const handle = normalizeInstagramHandle(row.instagram_handle);
    const instaUrl = instagramUrl(handle);
    return {
      id: row.id,
      emoji: emojiFor(type),
      name: row.name,
      title: row.title,
      type,
      verified: "Specialist",
      clinic: row.clinic_name ?? row.name,
      location: row.postcode ?? row.address ?? "",
      specs: row.specialisms ?? [],
      bio: row.bio ?? "",
      insta: handle ? `@${handle}` : "",
      instaUrl,
      website: normalizeWebsiteUrl(row.website_url) || instaUrl,
      bookCode: "",
      discount: row.discount_description ?? "",
      bookingUrl:
        normalizeWebsiteUrl(row.booking_url) || normalizeWebsiteUrl(row.website_url) || undefined,
      featured: true,
      listingTier: (row.listing_tier as Professional["listingTier"]) ?? "external_link",
      referralFeePercent:
        row.referral_fee_percent != null ? Number(row.referral_fee_percent) : null,
      directoryId: row.id,
    };
  });

  // A live pro owns their identity: drop any curated/seed entry for the same
  // person so a stale snapshot can never shadow or duplicate their listing.
  const liveNames = new Set(livePros.map((p) => norm(p.name)));
  const shadowed = (p: Professional) => {
    const key = norm(p.name);
    return [...liveNames].some((ln) => ln === key || ln.includes(key) || key.includes(ln));
  };

  const populationScore = (p: Professional) =>
    [p.bio, p.clinic, p.location, p.website, p.bookingUrl, p.discount, p.insta].filter(
      (v) => typeof v === "string" && v.trim().length > 0,
    ).length + (p.specs?.length ?? 0);

  const byKey = new Map<string, { pro: Professional; rank: number }>();
  const ranked: Array<[Professional, number]> = [
    // Live pros first and unfiltered — always in the directory.
    ...livePros.map((p) => [p, 2] as [Professional, number]),
    ...curatedPros.filter((p) => !shadowed(p)).map((p) => [p, 1] as [Professional, number]),
    // Editorial allowlist applies to the static seed only.
    ...PROFESSIONALS.filter((p) => isSeedAllowed(p.name) && !shadowed(p)).map(
      (p) => [p, 0] as [Professional, number],
    ),
  ];

  for (const [p, rank] of ranked) {
    // Live rows key on the LISTING id (`pro_profiles.id`) so a display-name
    // change never splits a card, and two stylists sharing one salon login
    // never collapse into a single entry.
    const key = p.proProfileId ? `profile:${p.proProfileId}` : `name:${norm(p.name)}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      rank > existing.rank ||
      (rank === existing.rank && populationScore(p) > populationScore(existing.pro))
    ) {
      byKey.set(key, { pro: p, rank });
    }
  }

  return Array.from(byKey.values()).map((v) => v.pro);
}

export function useDirectoryProfessionals() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: PRO_DIRECTORY_KEY,
    queryFn: loadDirectory,
    // The directory must always reflect the pros' latest saved profiles.
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    // A flaky connection must not be allowed to look like a two-entry
    // directory: retry, then report.
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    // NO placeholder seed. Showing the static editorial seed while the live
    // query is loading or failed made a broken fetch indistinguishable from a
    // directory containing only Yvonne and Erica.
  });

  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: PRO_DIRECTORY_KEY }),
    [qc],
  );

  return {
    pros: data ?? [],
    loading: isLoading || (isFetching && !data),
    error: error ? "Could not load latest directory" : null,
    refresh,
  };
}

