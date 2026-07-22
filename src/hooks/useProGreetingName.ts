import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves both a full display name and a first name for professional greetings.
 * Priority: pro_profiles.display_name → profiles.display_name → pro_applications.full_name.
 * Returns { firstName, fullName } — either can be null when nothing is on file.
 * Never returns an email address.
 */
export function useProGreetingName() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["pro_greeting_name", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ firstName: string | null; fullName: string | null }> => {
      const uid = user!.id;

      const [proProf, prof, app] = await Promise.all([
        supabase.from("pro_profiles").select("display_name").eq("user_id", uid).maybeSingle(),
        supabase.from("profiles").select("display_name").eq("user_id", uid).maybeSingle(),
        supabase
          .from("pro_applications")
          .select("full_name, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const clean = (v?: string | null) => {
        const s = (v ?? "").trim();
        return s.length ? s : null;
      };

      const full =
        clean(proProf.data?.display_name) ??
        clean(prof.data?.display_name) ??
        clean(app.data?.full_name) ??
        null;

      const first = full ? full.split(/\s+/)[0] : null;
      return { firstName: first, fullName: full };
    },
  });

  return {
    firstName: query.data?.firstName ?? null,
    fullName: query.data?.fullName ?? null,
    isLoading: query.isLoading,
  };
}
