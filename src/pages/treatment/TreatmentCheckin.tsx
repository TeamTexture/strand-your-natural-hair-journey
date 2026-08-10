import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { Camera, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import LoadingDot from "@/components/LoadingDot";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useTreatmentPlan } from "@/hooks/useTreatmentPlans";
import { usePlusAccess } from "@/hooks/usePlusAccess";
import TreatmentReadOnlyNotice from "@/components/treatment/TreatmentReadOnlyNotice";
import {
  useCheckinMedia,
  useCheckinMutations,
  useTreatmentCheckins,
  type CheckinRow,
} from "@/hooks/useTreatmentCheckin";
import {
  defaultRatings,
  ratingsWithDefaults,
  type CheckinRatings,
} from "@/lib/treatmentCheckin";
import {
  computeAdherence,
  dayCounts,
  isDailyPlan,
  daysBetween,

  fromDateKey,
  todayKey,
  weekNumberFor,
  weekRange,
} from "@/lib/treatmentSchedule";
import CheckinPhotos from "@/components/treatment/CheckinPhotos";
import CheckinVoiceNotes from "@/components/treatment/CheckinVoiceNotes";
import CheckinVideo from "@/components/treatment/CheckinVideo";

/**
 * Weekly check-in. One open question, plus the media pipeline — no scored
 * sliders, because the numbers made it feel like a form.
 *
 * A check-in row is opened as soon as the screen loads so photos, voice notes
 * and video have something to attach to while she's still filling it in. It
 * only counts as done once she saves, which sets submitted_at.
 */
/** Gentle openers she can tap instead of staring at an empty box. */
const CHECKIN_PROMPTS = [
  "What's working:",
  "What's harder than I expected:",
  "My scalp has felt:",
  "Something I noticed:",
];

const TreatmentCheckin = () => {
  const { id, week: weekParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { bundle, loading } = useTreatmentPlan(id);
  const { checkins, media, loading: mediaLoading, refetch } = useTreatmentCheckins(id);
  const { ensureCheckin, saveCheckin, completeMilestone, clearMilestone } = useCheckinMutations(id);
  // Lapsed STRAND+ reads and plays back everything, and writes nothing new.
  const { hasPlus } = usePlusAccess();

  const [checkin, setCheckin] = useState<CheckinRow | null>(null);
  const [ratings, setRatings] = useState<CheckinRatings>(defaultRatings());
  const [note, setNote] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const week = useMemo(() => {
    const parsed = Number(weekParam);
    if (Number.isFinite(parsed) && parsed >= 1) return Math.floor(parsed);
    if (!bundle) return 1;
    return Math.max(1, Math.min(bundle.plan.duration_weeks, weekNumberFor(bundle.plan.start_date, todayKey())));
  }, [weekParam, bundle]);

  const milestone = useMemo(
    () => bundle?.milestones.find((m) => m.week_number === week) ?? null,
    [bundle, week],
  );

  // Open (or reuse) the row for this week.
  useEffect(() => {
    if (!bundle || checkin || ensureCheckin.isPending || !hasPlus) return;
    const existing = checkins.find((c) => c.week_number === week);
    if (existing) {
      setCheckin(existing);
      return;
    }
    if (mediaLoading) return;
    ensureCheckin.mutate(
      { week, startDate: bundle.plan.start_date },
      { onSuccess: (row) => setCheckin(row), onError: () => toast.error("Couldn't open this check-in.") },
    );
  }, [bundle, checkins, checkin, week, mediaLoading, ensureCheckin, hasPlus]);

  // Pull any answers already saved for this week, once.
  useEffect(() => {
    if (!checkin || hydrated) return;
    setRatings(ratingsWithDefaults(checkin.ratings));
    setNote(checkin.written_note ?? "");
    setHydrated(true);
  }, [checkin, hydrated]);

  const own = useCheckinMedia(media, checkin?.id);
  const milestonePhotos = own.photos.filter((p) => p.milestone_id === milestone?.id);
  const otherPhotos = own.photos.filter((p) => p.milestone_id !== milestone?.id);

  if (loading || !user) {
    return (
      <ScreenLayout>
        <TitleBar title="Check-in" backFallback="/home" />
        <LoadingDot />
      </ScreenLayout>
    );
  }

  if (!bundle) {
    return (
      <ScreenLayout>
        <TitleBar title="Check-in" backFallback="/home" />
        <div className="px-5 pt-4">
          <EmptyState icon="🌱" message="We couldn't find that plan." />
        </div>
      </ScreenLayout>
    );
  }

  const { plan } = bundle;
  const range = weekRange(plan.start_date, week);

  // What she said she'd do at the start, measured against what she actually logged.
  const weekAdherence = computeAdherence(bundle.schedule, bundle.entries, plan.start_date, {
    from: range.start,
    to: range.end,
  });
  const overall = computeAdherence(bundle.schedule, bundle.entries, plan.start_date);
  // Day-level view, which is what a daily routine actually feels like.
  const weekDays = dayCounts(
    bundle.schedule,
    bundle.entries,
    plan.start_date,
    range.start,
    range.end,
  );

  const daysThisWeek = new Set(
    bundle.entries
      .filter(
        (e) =>
          e.status === "completed" &&
          daysBetween(range.start, e.entry_date) >= 0 &&
          daysBetween(e.entry_date, range.end) >= 0,
      )
      .map((e) => e.entry_date),
  ).size
  const daysOverall = new Set(
    bundle.entries.filter((e) => e.status === "completed").map((e) => e.entry_date),
  ).size;

  const save = () => {
    if (!checkin) return;
    saveCheckin.mutate(
      { checkinId: checkin.id, ratings, note },
      {
        onSuccess: () => {
          toast.success(`Week ${week} check-in saved`);
          navigate(`/treatment/${plan.id}?checkin=${week}`, { replace: true });
        },
        onError: () => toast.error("Couldn't save that just now — your media is still here."),
      },
    );
  };

  return (
    <ScreenLayout>
      <TitleBar title={`Week ${week} check-in`} backFallback={`/treatment/${plan.id}`} />

      <div className="px-5 pt-1 pb-10 space-y-4">
        {!hasPlus && <TreatmentReadOnlyNotice next={`/treatment/${plan.id}/checkin/${week}`} />}
        <div>
          <h1 className="font-display text-[24px] leading-tight">Week {week} check-in</h1>
          <p className="font-body text-[13px] text-muted-foreground mt-1 leading-snug">
            Tell us how it's going in your own words — write it, record it, or show it.
          </p>
          <p className="font-body text-[12px] text-muted-foreground mt-1">
            {format(fromDateKey(range.start), "d MMM")} – {format(fromDateKey(range.end), "d MMM")}
          </p>
        </div>

        {/* what she committed to, against what she logged */}
        <SurfaceCard className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-body text-[14px] font-semibold">How the week went to plan</p>
            <p className="font-display text-[17px] text-primary leading-none">
              {weekAdherence.hasData ? `${weekAdherence.percent}%` : "—"}
            </p>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/80"
              style={{ width: `${weekAdherence.hasData ? weekAdherence.percent : 0}%` }}
            />
          </div>
          <p className="font-body text-[12px] text-muted-foreground leading-snug">
            {weekAdherence.hasData
              ? isDailyPlan(bundle.schedule)
                ? `${weekDays.daysLogged} of ${weekDays.daysDue} day${weekDays.daysDue === 1 ? "" : "s"} fully logged this week — ${weekAdherence.completed} of ${weekAdherence.expected} ${weekAdherence.unit} in total.`
                : `${weekAdherence.completed} of ${weekAdherence.expected} ${weekAdherence.unit} logged this week, across ${daysThisWeek} ${daysThisWeek === 1 ? "day" : "days"}.`
              : "Nothing was due this week yet."}
            {weekAdherence.skipped > 0 &&
              ` ${weekAdherence.skipped} marked as skipped — that still tells us something.`}
          </p>

          <p className="font-body text-[12px] text-muted-foreground leading-snug border-t border-border pt-2">
            Since you started:{" "}
            {overall.hasData
              ? `${overall.completed} of ${overall.expected} ${overall.unit}, on ${daysOverall} ${daysOverall === 1 ? "day" : "days"} (${overall.percent}%).`
              : "your plan hasn't come due yet."}
          </p>
        </SurfaceCard>

        {/* milestone leads */}
        {milestone && (
          <SurfaceCard tone="gold" className="space-y-3">
            <div className="flex items-start gap-2">
              <Camera className="size-4 mt-0.5 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <p className="font-display text-[17px] leading-snug">{milestone.label}</p>
                {milestone.prompt && (
                  <p className="font-body text-[13px] text-muted-foreground mt-0.5 leading-snug">
                    {milestone.prompt}
                  </p>
                )}
              </div>
            </div>
            <CheckinPhotos
              userId={user.id}
              planId={plan.id}
              checkinId={hasPlus ? checkin?.id ?? null : null}
              photos={milestonePhotos}
              milestoneId={milestone.id}
              label={milestone.completed_at ? "Milestone photo added" : "Add the milestone photo"}
              onUploaded={(row) => {
                if (!milestone.completed_at)
                  completeMilestone.mutate({ milestoneId: milestone.id, mediaId: row.id });
                void refetch();
              }}
              onRemoved={() => {
                if (milestonePhotos.length <= 1) clearMilestone.mutate({ milestoneId: milestone.id });
                void refetch();
              }}
            />
          </SurfaceCard>
        )}

        {/* the open answer — leads, because it's the part she actually wants to say */}
        <SurfaceCard className="space-y-2">
          <div>
            <p className="font-display text-[18px] leading-snug">How's it going?</p>
            <p className="font-body text-[12px] text-muted-foreground mt-0.5 leading-snug">
              Say as much or as little as you like — in writing, out loud, or with a photo or clip below.
            </p>
          </div>
          <Textarea
            value={note}
            readOnly={!hasPlus}
            onChange={(e) => setNote(e.target.value.slice(0, 2000))}
            rows={5}
            placeholder="What's felt different this week? Anything that's been easy, or a struggle?"
            className="font-body text-[14px]"
          />
          {hasPlus && (
            <div className="flex flex-wrap gap-1.5">
              {CHECKIN_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() =>
                    setNote((n) => (n.trim() ? `${n.replace(/\s+$/, "")}\n\n${prompt} ` : `${prompt} `).slice(0, 2000))
                  }
                  className="rounded-pill border border-border px-2.5 py-1 font-body text-[11px] text-muted-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </SurfaceCard>





        {/* media */}
        <CheckinPhotos
          userId={user.id}
          planId={plan.id}
          checkinId={hasPlus ? checkin?.id ?? null : null}
          photos={otherPhotos}
          onUploaded={() => void refetch()}
          onRemoved={() => void refetch()}
          label={milestone ? "Any other photos" : "Photos"}
        />


        <CheckinVoiceNotes
          userId={user.id}
          planId={plan.id}
          checkinId={hasPlus ? checkin?.id ?? null : null}
          notes={own.audio}
          onUploaded={() => void refetch()}
          onRemoved={() => void refetch()}
        />

        <CheckinVideo
          userId={user.id}
          planId={plan.id}
          checkinId={hasPlus ? checkin?.id ?? null : null}
          video={own.video}
          onUploaded={() => void refetch()}
          onRemoved={() => void refetch()}
        />

        {hasPlus && (
          <Button
            className="rounded-pill w-full"
            onClick={save}
            disabled={!checkin || saveCheckin.isPending}
          >
            {saveCheckin.isPending ? (
              <Loader2 className="size-4 mr-1.5 animate-spin" />
            ) : (
              <Check className="size-4 mr-1.5" />
            )}
            Save check-in
          </Button>
        )}
        {hasPlus && (
          <p className="font-body text-[11px] text-muted-foreground text-center">
            Photos, voice notes and clips save as you add them.
          </p>
        )}
      </div>
    </ScreenLayout>
  );
};

export default TreatmentCheckin;
