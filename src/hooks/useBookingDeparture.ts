import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Records a departure to a professional's external booking page.
 *
 * The row is written BEFORE the browser leaves for the external URL, so a user
 * who never comes back to the tab is still recorded. Phase 2's return prompt
 * reads straight off this table, which is why the code and URL are snapshotted
 * here rather than re-read from the profile later — the professional may change
 * either of them after the fact.
 */
export function useLogBookingDeparture() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      professionalId: string;
      bookingUrl: string;
      discountCodeShown?: string | null;
    }): Promise<string | null> => {
      if (!user?.id) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("pro_booking_clicks")
        .insert({
          user_id: user.id,
          professional_id: input.professionalId,
          booking_url_at_click: input.bookingUrl,
          discount_code_shown: input.discountCodeShown?.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data?.id ?? null;
    },
  });
}
