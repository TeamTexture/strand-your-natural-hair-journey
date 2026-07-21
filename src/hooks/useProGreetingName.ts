import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves a friendly first name for professional greetings.
 * Priority: pro_profiles.display_name → profiles.display_name → pro_applications.full_name.
 * Returns null when none available (callers should render a neutral "Welcome back" fallback).
 * Never returns an email address.
 */
export function useProGreetingName() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["pro_greeting_name", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const uid = user!.id;

      const [proProf, prof, app] = await Promise.all([
        supabase.from("pro_profiles").select("display_name").eq("user_id", uid).maybeSingle(),
        supabase.from("profiles").select("display_name").eq("id", uid).maybeSingle(),
        supabase
          .from("pro_applications")
          .select("full_name, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const pick = (v?: string | null) => {
        const s = (v ?? "").trim();
        if (!s) return null;
        const first = s.split(/\s+/)[0];
        return first || null;
      };

      return (
        pick(proProf.data?.display_name) ??
        pick(prof.data?.display_name) ??
        pick(app.data?.full_name) ??
        null
      );
    },
  });

  return { firstName: query.data ?? null, isLoading: query.isLoading };
}
