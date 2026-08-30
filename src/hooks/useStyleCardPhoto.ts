// Resolves the image shown on the Home "Current style" card.
//
// Progress photos come from TWO places, and both count:
//   • user_before_photos      — the Strand Summary "Progress photos" grid
//   • user_milestone_photos   — the 6-week milestone gallery
//
// Resolution order (see user_style_profile.main_photo_id comment):
//   1. main_photo_id, when it is set AND the photo still exists
//   2. otherwise the newest progress photo across both sets —
//      taken_on desc nulls last, then created_at desc
//   3. otherwise null, and the caller falls back to a placeholder
//
// main_photo_id NULL is AUTO MODE: the newest photo wins with no writes
// required. Pinning is purely an override.

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PhotoSource = "before" | "milestone";

export interface MilestonePhoto {
  id: string;
  storage_path: string;
  caption: string | null;
  taken_on: string | null;
  created_at: string | null;
  url: string | null;
  source: PhotoSource;
}

const BUCKET: Record<PhotoSource, string> = {
  before: "before-photos",
  milestone: "milestone-photos",
};

export const styleCardPhotoKey = (userId?: string) => ["style-card-photo", userId ?? "anon"];

/** Newest first: taken_on desc nulls last, then created_at desc. */
export const sortProgressPhotos = <T extends { taken_on?: string | null; created_at?: string | null }>(
  rows: T[],
): T[] =>
  [...rows].sort((a, b) => {
    const at = a.taken_on ?? "";
    const bt = b.taken_on ?? "";
    if (at !== bt) return bt.localeCompare(at); // "" (null) sorts last
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });

/**
 * Pure resolver, exported for tests: given the pin and the photo set,
 * which photo should the card show?
 */
export const resolveStyleCardPhoto = <T extends { id: string; taken_on?: string | null; created_at?: string | null }>(
  mainPhotoId: string | null | undefined,
  photos: T[],
): T | null => {
  if (photos.length === 0) return null;
  if (mainPhotoId) {
    const pinned = photos.find((p) => p.id === mainPhotoId);
    if (pinned) return pinned;
  }
  return sortProgressPhotos(photos)[0] ?? null;
};

export function useStyleCardPhoto() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Last non-empty result, kept so a refetch — or the query key flipping while
  // the auth user rehydrates — never renders a "no photos" false negative.
  const lastGood = useRef<{ mainPhotoId: string | null; photos: MilestonePhoto[] } | undefined>(
    undefined,
  );

  const query = useQuery({
    queryKey: styleCardPhotoKey(user?.id),
    enabled: !!user,
    staleTime: 30_000,
    placeholderData: (prev) => prev ?? lastGood.current,
    queryFn: async () => {
      if (!user) return { mainPhotoId: null as string | null, photos: [] as MilestonePhoto[] };

      const [{ data: styleRow }, { data: milestoneRows }, { data: beforeRows }] = await Promise.all([
        supabase
          .from("user_style_profile")
          .select("main_photo_id")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("user_milestone_photos")
          .select("id, storage_path, caption, taken_on, created_at")
          .eq("user_id", user.id),
        supabase
          .from("user_before_photos")
          .select("id, storage_path, caption, created_at")
          .eq("user_id", user.id),
      ]);

      const combined: Omit<MilestonePhoto, "url">[] = [
        ...((milestoneRows ?? []) as Array<{
          id: string;
          storage_path: string;
          caption: string | null;
          taken_on: string | null;
          created_at: string | null;
        }>).map((r) => ({ ...r, source: "milestone" as const })),
        // Progress photos have no separate "taken on" — the upload date is it.
        ...((beforeRows ?? []) as Array<{
          id: string;
          storage_path: string;
          caption: string | null;
          created_at: string | null;
        }>).map((r) => ({
          ...r,
          taken_on: r.created_at ? r.created_at.slice(0, 10) : null,
          source: "before" as const,
        })),
      ];

      const base = sortProgressPhotos(combined);
      const signed = await Promise.all(
        base.map(async (r) => {
          const { data } = await supabase.storage
            .from(BUCKET[r.source])
            .createSignedUrl(r.storage_path, 3600);
          return { ...r, url: data?.signedUrl ?? null } as MilestonePhoto;
        }),
      );

      return {
        mainPhotoId: (styleRow as { main_photo_id?: string | null } | null)?.main_photo_id ?? null,
        photos: signed,
      };
    },
  });

  if (query.data && query.data.photos.length > 0) lastGood.current = query.data;

  const photos = query.data?.photos ?? [];
  const mainPhotoId = query.data?.mainPhotoId ?? null;
  const resolved = resolveStyleCardPhoto(mainPhotoId, photos);

  const setMainPhoto = useMutation({
    // photoId === null clears the pin and returns the card to auto mode.
    mutationFn: async (photoId: string | null) => {
      if (!user) return;
      const { error } = await supabase
        .from("user_style_profile")
        .upsert({ user_id: user.id, main_photo_id: photoId }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: styleCardPhotoKey(user?.id) });
      window.dispatchEvent(new Event("strand:style-updated"));
    },
  });

  return {
    photos,
    mainPhotoId,
    /** The photo the card should render, or null when the member has none. */
    photo: resolved,
    url: resolved?.url ?? null,
    /** True when no explicit pin is set — the newest photo is used. */
    isAuto: !mainPhotoId,
    loading: query.isLoading,
    setMainPhoto,
    refresh: () => queryClient.invalidateQueries({ queryKey: styleCardPhotoKey(user?.id) }),
  };
}
