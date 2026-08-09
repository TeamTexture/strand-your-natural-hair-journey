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
  ConsentView,
  keyAllowedInView,
  PRO_UNDERTAKING_KEY,
  recordConsents,
} from "@/lib/consent";

interface Props {
  /** Mandatory keys still outstanding — only these are asked for again. */
  outstanding: ConsentKey[];
  /**
   * Optional keys still genuinely UNANSWERED in the active view. An optional
   * consent already granted or declined is never re-asked here.
   */
  optionalKeys: ConsentKey[];
  /**
   * The view these requirements belong to. Anything not allowed in this view is
   * dropped before rendering, so a professional or brand item can never surface
   * on the end user side.
   */
  view?: ConsentView;
  /** Current recorded state per optional key, so toggles never show a default. */
  optionalGranted?: Partial<Record<ConsentKey, boolean>>;
}

const TICKBOX_LABEL = {
  /** Shown to consumers, professionals and admins — they all see guidance. */
  tier1WithDisclaimer:
    "I accept STRAND's Terms of Service and Privacy Policy, I confirm I am 18 or over, and I have read and understood the Medical Disclaimer.",
  /** Brands never see hair guidance, so the medical disclaimer does not apply. */
  tier1NoDisclaimer:
    "I accept STRAND's Terms of Service and Privacy Policy, and I confirm I am 18 or over.",
  health:
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

const ConsentGateScreen = ({
  outstanding,
  optionalKeys,
  view = "consumer",
  optionalGranted = {},
}: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const TIER1 = useMemo<ConsentKey[]>(
    () => ["terms", "privacy", "age_18", "medical_disclaimer"],
    [],
  );
  // VIEW SCOPING, enforced here as well as upstream: a key that is not allowed
  // in the active view is dropped, and the professional undertaking can never be
  // part of this screen in any view — it lives on entering the pro view.
  const scoped = useMemo(
    () => outstanding.filter((k) => k !== PRO_UNDERTAKING_KEY && keyAllowedInView(k, view)),
    [outstanding, view],
  );
  const scopedOptional = useMemo(
    () => optionalKeys.filter((k) => k !== PRO_UNDERTAKING_KEY && keyAllowedInView(k, view)),
    [optionalKeys, view],
  );
  const tier1Keys = useMemo(() => TIER1.filter((k) => scoped.includes(k)), [TIER1, scoped]);
  const needTier1 = tier1Keys.length > 0;
  const needDisclaimer = scoped.includes("medical_disclaimer");
  const needHealth = scoped.includes("health_data");

  const offersOffered = scopedOptional.includes("personalised_offers");
  const marketingOffered = scopedOptional.includes("marketing_email");

  const [tier1, setTier1] = useState(false);
  const [health, setHealth] = useState(false);
  // TIER 3 — optional, and never blocks the continue button. Toggles reflect the
  // member's recorded state; they only ever appear when never answered.
  const [offers, setOffers] = useState(!!optionalGranted.personalised_offers);
  const [marketing, setMarketing] = useState(!!optionalGranted.marketing_email);
  const [saving, setSaving] = useState(false);

  // The Professional Data Handling Undertaking is intentionally absent here —
  // it is presented on entering the professional view and gates client passport
  // access only, never initial login.
  const mandatoryReady = (!needTier1 || tier1) && (!needHealth || health);

  const submit = async () => {
    if (!mandatoryReady) return;
    setSaving(true);
    try {
      const payload: Partial<Record<ConsentKey, boolean>> = {};
      for (const key of tier1Keys) payload[key] = true;
      if (needHealth) payload.health_data = true;
      // Optional choices are always recorded — including a decline — but only
      // for the keys this account's roles were actually offered.
      if (offersOffered) payload.personalised_offers = offers;
      if (marketingOffered) payload.marketing_email = marketing;

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
              {needDisclaimer ? TICKBOX_LABEL.tier1WithDisclaimer : TICKBOX_LABEL.tier1NoDisclaimer}
            </Tick>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pl-8">
              <DocLink to="/legal/terms" label="Terms of Service" />
              <DocLink to="/legal/privacy" label="Privacy Policy" />
              {needDisclaimer && (
                <DocLink to="/legal/medical-disclaimer" label="Medical Disclaimer" />
              )}
            </div>
          </SurfaceCard>
        )}

        {needHealth && (
          <SurfaceCard className="mt-3 space-y-3">
            <Tick id="consent-health-data" checked={health} onChange={setHealth}>
              {TICKBOX_LABEL.health}
            </Tick>
            <div className="pl-8">
              <DocLink to="/legal/health-data" label="How we use health information" />
            </div>
          </SurfaceCard>
        )}

        {(offersOffered || marketingOffered) && (
        <div className="mt-7 border-t border-border/60 pt-1">
          <SectionLabel className="px-0">Optional — your choice</SectionLabel>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            These are entirely optional. Leaving them off does not affect your access to STRAND in
            any way, and you can change them any time in your profile.
          </p>

          <SurfaceCard className="mt-3 space-y-4">
            {offersOffered && (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[13px] text-foreground">Personalised brand offers</p>
                  <p className="text-[12px] text-muted-foreground">
                    Show offers matched to non-health details like your hair type and styles.
                  </p>
                </div>
                <Switch checked={offers} onCheckedChange={setOffers} aria-label="Personalised brand offers" />
              </div>
            )}
            {marketingOffered && (
              <div
                className={`flex items-start justify-between gap-4 ${
                  offersOffered ? "border-t border-border/60 pt-4" : ""
                }`}
              >
                <div>
                  <p className="text-[13px] text-foreground">Marketing emails</p>
                  <p className="text-[12px] text-muted-foreground">
                    News, launches and occasional offers. Service emails are sent either way.
                  </p>
                </div>
                <Switch checked={marketing} onCheckedChange={setMarketing} aria-label="Marketing emails" />
              </div>
            )}
          </SurfaceCard>
        </div>
        )}

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
