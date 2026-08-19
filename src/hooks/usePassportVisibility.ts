// Per-section passport visibility. A missing row means the section is
// visible — the toggle list is default-open, so we never require a row to
// exist before treating a section as shown.
//
// NOTE: this is app-layer filtering only. A consented professional still has
// database-level SELECT on the underlying tables; these toggles hide sections
// in the UI, they are not RLS enforcement.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type VisibilityMap = Record<string, boolean>;

export const passportVisibilityKey = (userId?: string) =>
  ["pro-passport-visibility", userId ?? "anon"] as const;

async function fetchVisibility(userId: string): Promise<VisibilityMap> {
  const { data, error } = await supabase
    .from("pro_passport_visibility")
    .select("section, visible")
    .eq("user_id", userId);
  if (error) throw error;
  const map: VisibilityMap = {};
  for (const row of data ?? []) map[row.section as string] = row.visible !== false;
  return map;
}

/** Read-only visibility map for any member (used by the pro passport view). */
export const usePassportVisibilityFor = (userId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: passportVisibilityKey(userId),
    enabled: !!userId && enabled,
    staleTime: 30_000,
    queryFn: () => fetchVisibility(userId!),
  });

/** Owner read + write for the settings screen. */
export const useMyPassportVisibility = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = usePassportVisibilityFor(user?.id);

  const setSection = useMutation({
    mutationFn: async ({ section, visible }: { section: string; visible: boolean }) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await supabase
        .from("pro_passport_visibility")
        .upsert(
          { user_id: user.id, section, visible, updated_at: new Date().toISOString() },
          { onConflict: "user_id,section" },
        );
      if (error) throw error;
    },
    onMutate: async ({ section, visible }) => {
      qc.setQueryData<VisibilityMap>(passportVisibilityKey(user?.id), (old) => ({
        ...(old ?? {}),
        [section]: visible,
      }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: passportVisibilityKey(user?.id) }),
  });

  return {
    map: query.data ?? {},
    loading: query.isLoading,
    isVisible: (section: string) => (query.data ?? {})[section] !== false,
    setSection,
  };
};
