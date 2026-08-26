// Profile settings toggle for marketing/personalised offers by email.
// Reads and writes profiles.personalised_offers_consent (the same column the
// /home card writes), so a "no" is never final.

import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  usePersonalisedOffersConsent,
  useSetPersonalisedOffersConsent,
} from "@/hooks/useAdTargeting";
import { supabase } from "@/integrations/supabase/client";

const PersonalisedOffersToggle = () => {
  const { data: on, isLoading } = usePersonalisedOffersConsent();
  const setConsent = useSetPersonalisedOffersConsent();

  const change = (next: boolean) => {
    setConsent.mutate(
      { on: next, source: "settings" },
      {
        onSuccess: () => {
          toast.success(next ? "Personalised offers on" : "Personalised offers off");
          // Keep the mailing list consent in step with her choice.
          void supabase.functions
            .invoke("klaviyo-member-sync", { body: { mode: "consent" } })
            .catch(() => undefined);
        },
        onError: () => toast.error("Could not save that — try again."),
      },
    );
  };

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[13px] text-foreground">
          <Megaphone className="size-3.5 text-primary" aria-hidden />
          Personalised offers by email
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Brand offers and discounts matched to your profile. Turn it off any time.
        </p>
      </div>
      <Switch
        checked={!!on}
        disabled={isLoading || setConsent.isPending}
        onCheckedChange={change}
        aria-label="Personalised offers by email"
      />
    </div>
  );
};

export default PersonalisedOffersToggle;
