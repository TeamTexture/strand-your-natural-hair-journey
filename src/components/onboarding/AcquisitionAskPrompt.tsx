import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { ACQUISITION_OPTIONS } from "@/components/onboarding/acquisitionOptions";

/**
 * MANDATORY retro ask — "How did you first find STRAND?"
 *
 * Members who finished onboarding before the attribution step existed will never
 * reach it naturally, so it is shown as a blocking one-time modal over Home.
 * It shows only when:
 *   - the member is a consumer (not a professional, brand or admin account),
 *   - she has reached Home (every onboarding/paywall gate runs before it),
 *   - acquisition_source is still empty,
 *   - the app is not in admin shadow view (never writes as another member).
 *
 * There is no close control, no backdrop dismiss and no escape key: selecting an
 * option is the only exit. The answer is stored on the profile, so once given the
 * modal can never return on any device.
 */
export function useAcquisitionAsk() {
  const { user, isViewingAs } = useAuth();
  const { isConsumer, isProfessional, isBrand, isAdmin, loading: rolesLoading } = useRoles();
  const qc = useQueryClient();

  const consumerOnly = isConsumer && !isProfessional && !isBrand && !isAdmin;
  const eligibleAccount = !!user?.id && !isViewingAs && !rolesLoading && consumerOnly;

  const { data: ask } = useQuery({
    queryKey: ["acquisition_retro_ask", user?.id],
    enabled: eligibleAccount,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("acquisition_source")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      const row = data as { acquisition_source?: string | null } | null;
      if (!row) return false;
      return !row.acquisition_source;
    },
  });

  const [answered, setAnswered] = useState(false);

  const markAnswered = async (source: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ acquisition_source: source, acquisition_asked_at: new Date().toISOString() })
      .eq("user_id", user!.id);
    if (error) throw error;
    qc.setQueryData(["acquisition_retro_ask", user!.id], false);
    setAnswered(true);
  };

  return { due: eligibleAccount && ask === true && !answered, markAnswered };
}

/**
 * The blocking modal itself — pill options, no dismissal path.
 */
const AcquisitionAskModal = ({
  onDone,
}: {
  onDone: (source: string) => Promise<void>;
}) => {
  const [saving, setSaving] = useState<string | null>(null);

  const choose = async (source: string) => {
    if (saving) return;
    setSaving(source);
    try {
      await onDone(source);
    } catch (err) {
      console.warn("[strand] retro acquisition save failed", err);
      toast.error("Could not save that — please try again.");
      setSaving(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="acquisition-ask-title"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-foreground/45 backdrop-blur-[2px] p-4"
    >
      <div className="w-full max-w-[340px] rounded-[20px] bg-background border border-border shadow-2xl p-5 max-h-[85%] overflow-y-auto">
        <h2
          id="acquisition-ask-title"
          className="font-display text-[20px] leading-snug text-foreground break-words"
        >
          Quick one before you carry on
        </h2>
        <p className="mt-1.5 font-body text-[13px] leading-relaxed text-muted-foreground">
          How did you first find STRAND?
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {ACQUISITION_OPTIONS.map((opt) => {
            const busy = saving === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => void choose(opt.value)}
                disabled={!!saving}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-pill border px-3 py-2 font-body text-[13px] transition-colors",
                  busy
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-surface-raised text-foreground/85 hover:border-primary/60 hover:bg-primary/[0.06]",
                  saving && !busy && "opacity-50",
                )}
              >
                <opt.icon className="size-3.5 shrink-0 text-primary" aria-hidden />
                <span className="break-words">{busy ? "Saving…" : opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AcquisitionAskModal;
