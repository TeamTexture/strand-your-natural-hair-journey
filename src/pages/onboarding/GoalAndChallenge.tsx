import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { onboardingBack } from "@/lib/onboardingFlow";
import OnboardingGuide from "@/components/onboarding/OnboardingGuide";
import ItalicSub from "@/components/ItalicSub";
import Tag from "@/components/Tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * GoalAndChallenge — the FIRST consumer onboarding step.
 *
 * It captures one thing she is working towards and what is getting in the way,
 * so every later screen (and her guidance) has an intent to hang off.
 *
 * Storage: ONE row in the existing `user_goals` table, tagged `kind:
 * "onboarding"` so it never collides with the numeric length-tracking goals
 * that also live there. No new table, no new column.
 *
 * This step is entirely optional — it is deliberately absent from every
 * completion and access check, so it can never gate Subscribe, payment or the
 * app. Continue works with nothing selected, and "Skip for now" bypasses it.
 *
 * Anything she types here is member-supplied DATA. If it ever reaches an AI
 * prompt it must be passed as data only and never read as instructions.
 */

/** Marker option that swaps the stored value for her own words. */
const OTHER = "Something else";

const GOALS = [
  "Length",
  "Thickness and fullness",
  "Less breakage",
  "A healthier scalp",
  "Growing out damage",
  "Keeping what I have",
  OTHER,
];

const CHALLENGES = [
  "Breakage",
  "Shedding",
  "Dryness",
  "My edges",
  "Thinning",
  "Scalp trouble",
  "Not knowing what to use",
  OTHER,
];

const MAX_FREE_TEXT = 120;

/** Small right-aligned live counter under a free-text input. */
const CharCount = ({ value }: { value: string }) => (
  <div className="mt-1 text-right text-[11px] font-body text-muted-foreground">
    {value.length}/{MAX_FREE_TEXT}
  </div>
);

const GoalAndChallenge = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [goal, setGoal] = useState<string | null>(null);
  const [goalOther, setGoalOther] = useState("");
  const [challenges, setChallenges] = useState<string[]>([]);
  const [challengeOther, setChallengeOther] = useState("");
  const [rowId, setRowId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Prefill from an existing onboarding goal row so returning here updates the
  // same row instead of stacking a second one.
  useEffect(() => {
    let live = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      const { data } = await supabase
        .from("user_goals")
        .select("id, title, challenges")
        .eq("user_id", u.user.id)
        .eq("kind", "onboarding")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!live || !data) return;
      setRowId(data.id);
      const title = (data.title ?? "").trim();
      if (title) {
        // A stored value that is not one of our options is her own words.
        if (GOALS.includes(title)) setGoal(title);
        else {
          setGoal(OTHER);
          setGoalOther(title.slice(0, MAX_FREE_TEXT));
        }
      }
      const saved = Array.isArray(data.challenges) ? data.challenges.filter((c): c is string => typeof c === "string") : [];
      const known = saved.filter((c) => CHALLENGES.includes(c));
      const custom = saved.find((c) => !CHALLENGES.includes(c));
      setChallenges(custom ? [...known, OTHER] : known);
      if (custom) setChallengeOther(custom.slice(0, MAX_FREE_TEXT));
    })();
    return () => {
      live = false;
    };
  }, []);

  const toggleChallenge = (opt: string) => {
    setChallenges((prev) => {
      const next = prev.includes(opt) ? prev.filter((v) => v !== opt) : [...prev, opt];
      // Deselecting "Something else" discards whatever was typed under it.
      if (opt === OTHER && prev.includes(OTHER)) setChallengeOther("");
      return next;
    });
  };

  const pickGoal = (opt: string) => {
    setGoal((prev) => {
      if (prev === OTHER && opt !== OTHER) setGoalOther("");
      return opt;
    });
  };

  const goNext = async (path: string) => {
    localStorage.setItem("strand_onboarding_step", "/onboarding/profile-step-1");
    const { data } = await supabase.auth.getUser();
    await queryClient.invalidateQueries({ queryKey: ["consumer_onboarding_route", data.user?.id] });
    await queryClient.invalidateQueries({ queryKey: ["user_goals", data.user?.id ?? "anon"] });
    navigate(path);
  };

  const save = async () => {
    const typedGoal = goalOther.trim().slice(0, MAX_FREE_TEXT);
    const typedChallenge = challengeOther.trim().slice(0, MAX_FREE_TEXT);
    // "Something else" with nothing typed is ignored entirely — never stored as
    // the literal words "Something else", and never a reason to block Continue.
    const title = goal === OTHER ? typedGoal : (goal ?? "");
    const challengeList = challenges
      .map((c) => (c === OTHER ? typedChallenge : c))
      .filter((c) => c.length > 0);

    if (!title && challengeList.length === 0) return true; // nothing to save

    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return true;

    const payload = {
      user_id: u.user.id,
      kind: "onboarding",
      title: title || "Hair goal",
      challenges: challengeList,
      status: "active",
      started_at: new Date().toISOString(),
    };

    const { data: saved, error } = rowId
      ? await supabase.from("user_goals").update(payload as never).eq("id", rowId).eq("user_id", u.user.id).select("id").maybeSingle()
      : await supabase.from("user_goals").insert(payload as never).select("id").maybeSingle();
    if (error) {
      console.error("[strand] onboarding goal save failed", error);
      toast.error("Could not save your goal. Check your connection.");
      return false;
    }
    if (saved?.id) setRowId(saved.id);
    return true;
  };

  const onContinue = async () => {
    setSaving(true);
    const ok = await save();
    setSaving(false);
    if (ok) void goNext("/onboarding/profile-step-1");
  };

  return (
    <ScreenLayout>
      <TitleBar title="Your Goal" onBack={onboardingBack(navigate, "/onboarding/goal")} />
      <OnboardingGuide className="pt-2 pb-1" />
      <ItalicSub>There are no wrong answers, and you can change this at any time.</ItalicSub>

      <div className="px-5 pb-8 space-y-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
            What are you working towards?
          </div>
          <div className="flex flex-wrap gap-2">
            {GOALS.map((o) => (
              <Tag key={o} selected={goal === o} onClick={() => pickGoal(o)}>
                {o}
              </Tag>
            ))}
          </div>
          {goal === OTHER && (
            <div className="mt-3">
              <Input
                value={goalOther}
                maxLength={MAX_FREE_TEXT}
                onChange={(e) => setGoalOther(e.target.value.slice(0, MAX_FREE_TEXT))}
                placeholder="In your words"
                aria-label="Your goal, in your words"
              />
              <CharCount value={goalOther} />
            </div>
          )}
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
            What's the hardest part right now?
          </div>
          <div className="flex flex-wrap gap-2">
            {CHALLENGES.map((o) => (
              <Tag key={o} selected={challenges.includes(o)} onClick={() => toggleChallenge(o)}>
                {o}
              </Tag>
            ))}
          </div>
          {challenges.includes(OTHER) && (
            <div className="mt-3">
              <Input
                value={challengeOther}
                maxLength={MAX_FREE_TEXT}
                onChange={(e) => setChallengeOther(e.target.value.slice(0, MAX_FREE_TEXT))}
                placeholder="In your words"
                aria-label="Your challenge, in your words"
              />
              <CharCount value={challengeOther} />
            </div>
          )}
        </div>

        <div className="space-y-3 pt-1">
          <Button variant="gold" size="pill" className="w-full" disabled={saving} onClick={onContinue}>
            Continue →
          </Button>
          <button
            type="button"
            className="w-full text-center text-[12px] font-body text-muted-foreground underline underline-offset-4"
            onClick={() => void goNext("/onboarding/profile-step-1")}
          >
            Skip for now
          </button>
        </div>
      </div>
    </ScreenLayout>
  );
};

export default GoalAndChallenge;
