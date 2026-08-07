import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { consentKey } from "@/hooks/useConsentState";
import { myProfileKey } from "@/hooks/useMyProfile";
import {
  CONSENT_DOCUMENT_VERSION,
  ConsentKey,
  MANDATORY_KEYS,
  recordConsents,
} from "@/lib/consent";

interface Props {
  /** Mandatory keys still outstanding — only these are asked for again. */
  outstanding: ConsentKey[];
}

const TICKBOX_LABEL: Record<string, string> = {
  tier1: "I accept STRAND's Terms of Service and Privacy Policy, I confirm I am 18 or over, and I have read and understood the Medical Disclaimer.",
  tier2:
    "I explicitly consent to STRAND processing my health information — blood test results, scalp conditions, medications and health profile — to generate my personalised guidance. STRAND cannot be provided without this.",
};

const Tick = ({
  checked,
  onChange,
  children,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  id: string;
}) => (
  <button
    type="button"
    id={id}
    role="checkbox"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="w-full flex gap-3 text-left"
  >
    <span
      className={`mt-0.5 size-5 shrink-0 rounded-[6px] border flex items-center justify-center transition-colors ${
        checked ? "bg-primary border-primary text-primary-foreground" : "border-border bg-card"
      }`}
      aria-hidden="true"
    >
      {checked && <Check className="size-3.5" strokeWidth={3} />}
    </span>
    <span className="text-[13px] leading-relaxed text-foreground">{children}</span>
  </button>
);

const DocLink = ({ to, label }: { to: string; label: string }) => (
  <Link
    to={to}
    className="inline-flex items-center gap-1 text-[12px] text-primary underline underline-offset-4"
  >
    {label}
    <ExternalLink className="size-3" aria-hidden="true" />
  </Link>
);

const ConsentGateScreen = ({ outstanding }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const needTier1 = useMemo(
    () => outstanding.some((k) => k !== "health_data"),
    [outstanding],
  );
  const needTier2 = outstanding.includes("health_data");

  const [tier1, setTier1] = useState(false);
  const [tier2, setTier2] = useState(false);
  // TIER 3 — optional. Default OFF, and never blocks the continue button.
  const [offers, setOffers] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [saving, setSaving] = useState(false);

  const mandatoryReady = (!needTier1 || tier1) && (!needTier2 || tier2);

  const submit = async () => {
    if (!mandatoryReady) return;
    setSaving(true);
    try {
      const payload: Partial<Record<ConsentKey, boolean>> = {};
      if (needTier1) {
        for (const key of MANDATORY_KEYS) {
          if (key !== "health_data" && outstanding.includes(key)) payload[key] = true;
        }
      }
      if (needTier2) payload.health_data = true;
      // Optional choices are always recorded — including a decline.
      payload.personalised_offers = offers;
      payload.marketing_email = marketing;

      await recordConsents(payload);
      await qc.invalidateQueries({ queryKey: consentKey(user?.id) });
      await qc.invalidateQueries({ queryKey: myProfileKey(user?.id) });
      toast.success("Thank you — that's recorded.");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your choices.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenLayout>
      <title>STRAND — Before you begin</title>
      <div className="px-5 pt-8 pb-10">
        <h1 className="font-display text-2xl text-foreground">Before you begin</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Please read and accept the items below. You can open each document in full first.
        </p>

        <SectionLabel className="px-0">Required</SectionLabel>

        {needTier1 && (
          <SurfaceCard className="space-y-3">
            <Tick id="consent-tier1" checked={tier1} onChange={setTier1}>
              {TICKBOX_LABEL.tier1}
            </Tick>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pl-8">
              <DocLink to="/legal/terms" label="Terms of Service" />
              <DocLink to="/legal/privacy" label="Privacy Policy" />
              <DocLink to="/legal/medical-disclaimer" label="Medical Disclaimer" />
            </div>
          </SurfaceCard>
        )}

        {needTier2 && (
          <SurfaceCard className="mt-3 space-y-3">
            <Tick id="consent-tier2" checked={tier2} onChange={setTier2}>
              {TICKBOX_LABEL.tier2}
            </Tick>
            <div className="pl-8">
              <DocLink to="/legal/health-data" label="How we use health information" />
            </div>
          </SurfaceCard>
        )}

        <div className="mt-7 border-t border-border/60 pt-1">
          <SectionLabel className="px-0">Optional — your choice</SectionLabel>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            These are entirely optional. Leaving both off does not affect your access to STRAND in
            any way, and you can change them any time in your profile.
          </p>

          <SurfaceCard className="mt-3 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13px] text-foreground">Personalised brand offers</p>
                <p className="text-[12px] text-muted-foreground">
                  Show offers matched to non-health details like your hair type and styles.
                </p>
              </div>
              <Switch checked={offers} onCheckedChange={setOffers} aria-label="Personalised brand offers" />
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-border/60 pt-4">
              <div>
                <p className="text-[13px] text-foreground">Marketing emails</p>
                <p className="text-[12px] text-muted-foreground">
                  News, launches and occasional offers. Service emails are sent either way.
                </p>
              </div>
              <Switch checked={marketing} onCheckedChange={setMarketing} aria-label="Marketing emails" />
            </div>
          </SurfaceCard>
        </div>

        <Button
          variant="gold"
          size="pill"
          className="w-full mt-7"
          disabled={!mandatoryReady || saving}
          onClick={submit}
        >
          {saving ? "Saving…" : "Accept and continue"}
        </Button>

        <button
          type="button"
          onClick={async () => {
            try {
              await supabase.auth.signOut();
            } catch {
              // ignore
            }
          }}
          className="mt-4 w-full text-center text-[12px] text-muted-foreground underline underline-offset-4"
        >
          Sign out instead
        </button>

        <p className="mt-5 text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Document version {CONSENT_DOCUMENT_VERSION}
        </p>
      </div>
    </ScreenLayout>
  );
};

export default ConsentGateScreen;
