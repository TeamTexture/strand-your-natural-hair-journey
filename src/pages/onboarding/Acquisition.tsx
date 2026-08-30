import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import OnboardingGuide from "@/components/onboarding/OnboardingGuide";
import OnboardingScreenHeading from "@/components/onboarding/OnboardingScreenHeading";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { onboardingBack } from "@/lib/onboardingFlow";
import { useInvalidateOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { ACQUISITION_PATH } from "@/lib/trialWall";
import { TRIAL_PAYWALL_PATH } from "@/lib/trialOffer";
import { toast } from "sonner";
import { ACQUISITION_OPTIONS as OPTIONS } from "@/components/onboarding/acquisitionOptions";


/**
 * "How did you find STRAND?" — a single optional marketing-attribution question
 * placed between About You and the free-trial splash. Skippable: skipping marks
 * the question as asked (so it never re-appears) and stores no answer.
 */
const Acquisition = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const invalidateOnboarding = useInvalidateOnboardingStatus();
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [saving, setSaving] = useState(false);

  // Already answered once — never ask again. Only a stored source counts: this
  // step is mandatory, so a skipped/stamped-but-empty profile must ask again.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("acquisition_source")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const row = data as { acquisition_source?: string | null } | null;
      if (row?.acquisition_source) {
        navigate(TRIAL_PAYWALL_PATH, { replace: true });
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  const finish = async (source: string) => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          acquisition_source: source,
          acquisition_source_other: source === "other" ? otherText.trim() || null : null,
          acquisition_asked_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      if (error) throw error;
    } catch (err) {
      console.warn("[strand] acquisition save failed", err);
      toast.error("Could not save that — please try again.");
      setSaving(false);
      return;
    }
    // The TrialWall reads acquisitionAnswered from this shared cached query —
    // refresh it before navigating or the wall bounces straight back here.
    await invalidateOnboarding();
    navigate(TRIAL_PAYWALL_PATH, { replace: true });
  };

  if (checking) {
    return (
      <ScreenLayout>
        <LoadingDot />
      </ScreenLayout>
    );
  }

  const selectedOption = OPTIONS.find((o) => o.value === selected) ?? null;

  return (
    <ScreenLayout>
      <TitleBar
        title="My STRAND"
        onBack={onboardingBack(navigate, ACQUISITION_PATH)}
        right={
          <button
            type="button"
            onClick={() => void finish(null)}
            disabled={saving}
            className="text-xs font-body text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
          >
            Skip
          </button>
        }
      />
      <OnboardingGuide className="pt-2 pb-1" />
      <OnboardingScreenHeading
        title="One last thing — how did you find us?"
        subtitle="Helps us know where to focus, so we can keep bringing this to more people like you."
      />

      <div className="px-5 pb-8 flex flex-col flex-1">
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
            {selectedOption && (
              <selectedOption.icon className="size-4 shrink-0 text-primary" aria-hidden />
            )}
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
              {OPTIONS.map((opt) => {
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
    </ScreenLayout>
  );
};

export default Acquisition;
