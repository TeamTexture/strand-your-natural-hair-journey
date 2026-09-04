// useCurrentStyleToken — a short, stable token for the member's CURRENT and
// PLANNED hairstyle.
//
// WHY THIS EXISTS (2026-09-04): the guidance surfaces keep a "last good" copy of
// their tip under a key that carries no signature, so a style change renders the
// previous tip while the new one generates. That is right for a spinner, but it
// meant copy written for a style she no longer wears kept showing next to freshly
// generated copy for her new style — one card describing two different styles.
//
// Scoping the last-good cache by this token keeps stale-while-revalidate for the
// SAME style and guarantees copy for a different style is never rendered.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { hashString } from "@/lib/tipSignature";

export const STYLE_TOKEN_COLUMNS =
  "current_hairstyle, planned_next_style, current_style_tension, current_style_extensions";

/** Build the token from an already-loaded style row. */
export const styleTokenOf = (style: Record<string, unknown> | null): string => {
  const v = (k: string) => {
    const x = style?.[k];
    return x === null || x === undefined ? "" : String(x);
  };
  return hashString(
    [
      `cur:${v("current_hairstyle")}`,
      `plan:${v("planned_next_style")}`,
      `ten:${v("current_style_tension")}`,
      `ext:${v("current_style_extensions")}`,
    ].join("::"),
  );
};

/**
 * The current style token for the signed-in (or viewed-as) member.
 * `ready` is false until the style row has been read — callers must not read a
 * style-scoped cache before then.
 */
export function useCurrentStyleToken(): { token: string | undefined; ready: boolean } {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["current-style-token", user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
    queryFn: async (): Promise<string> => {
      const res = await supabase
        .from("user_style_profile")
        .select(STYLE_TOKEN_COLUMNS)
        .eq("user_id", user!.id)
        .maybeSingle();
      return styleTokenOf((res.data as Record<string, unknown> | null) ?? null);
    },
  });
  return { token: data, ready: !!data };
}
