import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import OnboardingGuide from "@/components/onboarding/OnboardingGuide";
import OnboardingScreenHeading from "@/components/onboarding/OnboardingScreenHeading";
import OnboardingSectionCard from "@/components/onboarding/OnboardingSectionCard";
import SupplementPicker, { type SelectedSupplement } from "@/components/SupplementPicker";
import { Button } from "@/components/ui/button";
import { onboardingBack } from "@/lib/onboardingFlow";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Onboarding — supplements. Its own step, immediately after the health profile
 * (medications) step, and optional in the same way: she can skip it and add
 * them later from the Nutrition plan.
 */
const ProfileSupplements = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [supps, setSupps] = useState<SelectedSupplement[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("user_supplements")
        .select("name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (alive && data) setSupps(data.map((r) => ({ name: r.name as string })));
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const next = () => navigate("/onboarding/profile-step-3-hair");

  const onContinue = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("user_supplements")
        .select("id, name")
        .eq("user_id", user.id);
      const keep = new Set(supps.map((s) => s.name.toLowerCase()));
      const existingNames = new Set(
        (existing ?? []).map((r) => (r.name as string).toLowerCase()),
      );

      const toDelete = (existing ?? [])
        .filter((r) => !keep.has((r.name as string).toLowerCase()))
        .map((r) => r.id as string);
      if (toDelete.length > 0) {
        await supabase.from("user_supplements").delete().in("id", toDelete);
      }

      const toInsert = supps
        .filter((s) => !existingNames.has(s.name.toLowerCase()))
        .map((s) => ({
          user_id: user.id,
          name: s.name.slice(0, 80),
          source: "manual" as const,
        }));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("user_supplements").insert(toInsert);
        if (error) throw error;
      }
      next();
    } catch (e) {
      console.error("supplement save failed", e);
      toast.error("Couldn't save your supplements. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar
        title="Supplements"
        onBack={onboardingBack(navigate, "/onboarding/profile-supplements")}
      />
      <OnboardingGuide className="pt-2 pb-1" />
      <OnboardingScreenHeading
        title="What you're already taking"
        subtitle="Tell us what you're already taking. STRAND uses this so your nutrition guidance builds on what you're covering instead of repeating it back to you."
      />

      <div className="px-5 pb-10 space-y-3">
        <OnboardingSectionCard number={1} title="Your supplements">
          <SupplementPicker value={supps} onChange={setSupps} label="What you take" />
        </OnboardingSectionCard>


        <Button
          variant="gold"
          size="pill"
          className="w-full"
          disabled={saving}
          onClick={() => void onContinue()}
        >
          {saving ? "Saving…" : "Continue →"}
        </Button>
        <button
          type="button"
          onClick={next}
          className="w-full text-[12px] font-body text-muted-foreground underline"
        >
          I don't take any — skip for now
        </button>
      </div>
    </ScreenLayout>
  );
};

export default ProfileSupplements;
