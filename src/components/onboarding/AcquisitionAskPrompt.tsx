import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { ACQUISITION_OPTIONS } from "@/components/onboarding/acquisitionOptions";

/**
 * ONE-TIME retro ask — "How did you find STRAND?"
 *
 * Members who joined before the onboarding attribution step exists will never
 * reach it naturally, so it is offered once as a light interstitial over Home.
 * It shows only when:
 *   - the member is a consumer (not a professional, brand or admin account),
 *   - onboarding is already finished,
 *   - acquisition_source AND acquisition_asked_at are both still empty,
 *   - the app is not in admin shadow view (never writes as another member).
 *
 * Answering or skipping stamps acquisition_asked_at, so it can never return —
 * the read is the same condition, on a durable database field, not a local flag.
 */
const AcquisitionAskPrompt = () => {
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
        .select("acquisition_source, acquisition_asked_at, onboarding_completed_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      const row = data as {
        acquisition_source?: string | null;
        acquisition_asked_at?: string | null;
        onboarding_completed_at?: string | null;
      } | null;
      if (!row) return false;
      return (
        !!row.onboarding_completed_at && !row.acquisition_source && !row.acquisition_asked_at
      );
    },
  });

  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!eligibleAccount || ask !== true || dismissed) return null;

  const finish = async (source: string | null) => {
    if (saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ acquisition_source: source, acquisition_asked_at: new Date().toISOString() })
      .eq("user_id", user!.id);
    if (error) {
      console.warn("[strand] retro acquisition save failed", error);
      toast.error("Could not save that — please try again.");
      setSaving(false);
      return;
    }
    qc.setQueryData(["acquisition_retro_ask", user!.id], false);
    setDismissed(true);
    if (source) toast.success("Thank you — that really helps.");
  };

  const selectedOption = ACQUISITION_OPTIONS.find((o) => o.value === selected) ?? null;

  return (
    <div className="absolute inset-0 z-50 bg-background flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <span className="font-display text-[15px] tracking-wide text-foreground">My STRAND</span>
        <button
          type="button"
          onClick={() => void finish(null)}
          disabled={saving}
          className="text-xs font-body text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
        >
          Skip
        </button>
      </div>

      <div className="px-5 pt-4">
        <h1 className="font-display text-[22px] leading-snug text-foreground break-words">
          One quick thing — how did you find us?
        </h1>
        <p className="mt-2 font-body text-[13px] leading-relaxed text-muted-foreground">
          Helps us know where to focus, so we can keep bringing this to more people like you.
        </p>
      </div>

      <div className="px-5 pb-8 pt-6 flex flex-col flex-1">
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              "relative flex w-full items-center gap-2.5 bg-surface-raised rounded-[10px] border transition-colors px-3.5 py-3 text-left",
              open || selected ? "border-primary/60" : "border-border",
            )}
          >
            {selectedOption && <selectedOption.icon className="size-4 shrink-0 text-primary" aria-hidden />}
            <span
              className={cn(
                "flex-1 min-w-0 font-body text-[14.5px]",
                selectedOption ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {selectedOption ? selectedOption.label : "Choose one…"}
            </span>
            <ChevronDown
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </button>

          {open && (
            <div
              role="listbox"
              aria-label="How did you find STRAND?"
              className="absolute z-20 inset-x-0 top-full mt-1.5 rounded-[12px] border border-primary/30 bg-background shadow-xl overflow-hidden"
            >
              {ACQUISITION_OPTIONS.map((opt) => {
                const active = opt.value === selected;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setSelected(opt.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left font-body text-[14px] transition-colors",
                      active ? "bg-primary/12 text-foreground" : "text-foreground/85 hover:bg-primary/[0.06]",
                    )}
                  >
                    <opt.icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    <span className="flex-1 min-w-0 break-words">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-auto pt-6">
          <Button
            variant="gold"
            size="pill"
            className="w-full"
            disabled={!selected || saving}
            onClick={() => void finish(selected)}
          >
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AcquisitionAskPrompt;
