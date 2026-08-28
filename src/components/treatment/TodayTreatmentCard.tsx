import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  NotebookPen,
  Package,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import SectionHeader from "@/components/nav/SectionHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useActiveTreatmentPlans, useDueToday, useLogTreatmentStep } from "@/hooks/useTreatmentPlans";
import { useTreatmentCheckins } from "@/hooks/useTreatmentCheckin";
import { useCheckinReminder } from "@/hooks/useCheckinReminder";
import { useSignedMedia } from "@/hooks/useSignedMedia";
import { useAuth } from "@/hooks/useAuth";
import { readViewPref, writeViewPref } from "@/lib/viewPrefs";
import TreatmentStreak from "@/components/treatment/TreatmentStreak";
import { usePlusAccess } from "@/hooks/usePlusAccess";
import TreatmentPlusUpsell from "@/components/treatment/TreatmentPlusUpsell";
import TreatmentReadOnlyNotice from "@/components/treatment/TreatmentReadOnlyNotice";
import StepLogSheet from "@/components/treatment/StepLogSheet";
import { alertAnchorId, ALERT_KEYS } from "@/lib/alertKeys";
import { skipLabel, slotLabel } from "@/lib/treatmentSchedule";


/**
 * THE TREATMENT PLAN CARD — one card on Home, nothing else.
 *
 * Everything the plan needs to say lives here: which plan it is, the products
 * it uses, today's step (or the fact today is done), the open check-in, and
 * the streak. There is deliberately no second treatment card on Home — a
 * separate check-in banner used to sit above this one and read as two plans.
 *
 * One tap logs a step. No confirmation dialogs, no sheets, no second screen:
 * extra friction here is what kills adherence. Skipping is neutral by design —
 * no red, no warnings, no guilt copy anywhere on this surface.
 */
const TodayTreatmentCard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { steps, streakLine, streak, days, loading, hasActivePlan } = useDueToday();
  const { bundles } = useActiveTreatmentPlans();
  const { hasPlus, isLoading: plusLoading } = usePlusAccess();
  const { log, undo } = useLogTreatmentStep();
  const [logging, setLogging] = useState(false);

  // Logged steps drop off the card straight away and the next one takes its
  // place — she only ever sees what's still outstanding.
  const pending = steps.filter((s) => !s.entry);
  const loggedToday = steps.filter((s) => s.entry);
  const current = pending[0];
  const lastLogged = loggedToday[loggedToday.length - 1];

  // The plan this card speaks for: whichever has a step due, else the first.
  const bundle = bundles.find((b) => b.plan.id === current?.plan.id) ?? bundles[0];
  const plan = bundle?.plan;

  const { open: openCheckin, skip: skipCheckin } = useCheckinReminder();
  const { checkins, media } = useTreatmentCheckins(plan?.id);

  // HER STARTING POINT — the first check-in she filled in, day one (week 0)
  // where it exists, otherwise her earliest week. It counts as written once
  // there are words on it (the transcribed voice note lands in written_note)
  // or a photo attached, so a saved-but-unsubmitted first week still previews.
  const startingPointRow =
    [...checkins]
      .sort((a, b) => a.week_number - b.week_number)
      .find(
        (c) =>
          !!c.submitted_at ||
          !!c.written_note?.trim() ||
          media.some((m) => m.checkin_id === c.id && m.media_type === "photo"),
      ) ?? null;
  const startingPhotos = media
    .filter((m) => m.checkin_id === startingPointRow?.id && m.media_type === "photo")
    .slice(0, 3);
  const { urls: startingUrls } = useSignedMedia(startingPhotos.map((m) => m.storage_path));

  // Collapse is a view preference, per member and per plan — never member data.
  const collapseKey = plan ? `treatment_card_collapsed_${plan.id}` : null;
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!collapseKey) return;
    setCollapsed(readViewPref<boolean>(user?.id, collapseKey, false));
  }, [collapseKey, user?.id]);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      if (collapseKey) writeViewPref(user?.id, collapseKey, next);
      return next;
    });
  };


  if (loading || plusLoading) return null;

  // Treatment plans are STRAND+ for every client, no exceptions. A Basic member
  // with no plan gets the offer; one with a plan keeps read access to it.
  if (!hasPlus && !hasActivePlan) return <TreatmentPlusUpsell />;

  if (!hasActivePlan || !plan) {
    return (
      <div className="space-y-2">
        <SectionHeader icon={Sparkles}>Treatment plan</SectionHeader>
        <EmptyState
          icon="🌱"
          message="Following a treatment right now?"
          hint="Set it up once and tick it off each day — you'll see exactly how consistent you've been."
          action={
            <Button className="rounded-pill" onClick={() => navigate("/treatment/new")}>
              Create a plan
            </Button>
          }
        />
      </div>
    );
  }

  const onSkip = (planId: string, scheduleId: string, slot: "morning" | "evening") =>
    log.mutate(
      { planId, scheduleId, slot, status: "skipped" },
      { onError: () => toast.error("Couldn't save that just now — try again") },
    );

  const products = bundle?.products ?? [];
  const heroImage = current?.product?.image_url ?? products.find((p) => p.image_url)?.image_url ?? null;
  const checkinForThisPlan = openCheckin && openCheckin.planId === plan.id ? openCheckin : null;
  const checkinIsDayOne = !!checkinForThisPlan?.cycle.isDayOne;

  return (
    <div className="space-y-2" data-tour="treatment-today">
      <SectionHeader
        icon={Sparkles}
        action={
          <button
            onClick={() => navigate(`/treatment/${plan.id}`)}
            className="font-body text-[12px] text-primary"
          >
            View plan
          </button>
        }
      >
        My treatment plan
      </SectionHeader>

      {!hasPlus && <TreatmentReadOnlyNotice next="/home" />}

      <SurfaceCard
        id={alertAnchorId(ALERT_KEYS.TREATMENT_CHECKIN)}
        className="space-y-3.5"
      >
        {/* Plan identity first: the title in full, never clipped. Collapsed,
            this row is the whole card — photo and title, nothing else. */}
        <div className="flex items-start gap-2">
          <button
            onClick={() => navigate(`/treatment/${plan.id}`)}
            className="min-w-0 flex-1 flex items-start gap-3 text-left min-h-[44px]"
            aria-label={`Open ${plan.title}`}
          >
            {heroImage ? (
              <img
                src={heroImage}
                alt=""
                loading="lazy"
                className="size-12 rounded-xl object-cover shrink-0 border border-border/60"
              />
            ) : (
              <span className="size-12 rounded-xl shrink-0 bg-primary/10 flex items-center justify-center">
                <Sparkles className="size-5 text-primary" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[20px] leading-tight break-words [overflow-wrap:anywhere]">
                {plan.title}
              </span>
              {!collapsed && (
                <span className="block font-body text-[11.5px] text-muted-foreground mt-1">
                  Week {current?.week ?? 1} of {plan.duration_weeks} · Open plan
                </span>
              )}
            </span>
            {collapsed && <ChevronRight className="size-4 text-primary shrink-0 mt-1" />}
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Show my treatment plan" : "Hide my treatment plan"}
            className="shrink-0 size-9 -mr-1 rounded-full flex items-center justify-center text-primary"
          >
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </button>
        </div>

        {!collapsed && (
          <>

        {products.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
              Products on this plan
            </p>
            <ul className="space-y-1.5">
              {products.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-2.5 rounded-[12px] border border-border bg-card px-2.5 py-2"
                >
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt=""
                      loading="lazy"
                      className="size-9 rounded-[8px] object-cover shrink-0 bg-secondary"
                    />
                  ) : (
                    <span className="size-9 rounded-[8px] shrink-0 bg-secondary flex items-center justify-center">
                      <Package className="size-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-body text-[13px] leading-snug break-words [overflow-wrap:anywhere]">
                      {p.product_name}
                    </span>
                    {p.brand && (
                      <span className="block font-body text-[11px] text-muted-foreground mt-0.5 break-words">
                        {p.brand}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="h-px bg-border/60" />

        {/* TODAY */}
        {steps.length === 0 ? (
          <div>
            <p className="font-display text-[16px] leading-snug">Nothing due today.</p>
            <p className="font-body text-[13px] text-muted-foreground mt-1">
              Your next step comes round on schedule.
            </p>
          </div>
        ) : !current ? (
          <div className="flex items-start gap-3">
            <span className="mt-0.5 size-6 rounded-full flex items-center justify-center shrink-0 bg-good/20 text-good">
              <Check className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[16px] leading-snug">That's today logged.</p>
              <p className="font-body text-[13px] text-muted-foreground mt-0.5">
                {loggedToday.length === 1
                  ? "One step logged."
                  : `${loggedToday.length} steps logged.`}{" "}
                Your next step comes round on schedule.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">
              {slotLabel(current.slot)} · today
            </p>

            <div className="min-w-0">
              <h3 className="font-display text-[18px] leading-tight break-words">
                {current.row.task_name}
              </h3>
              {current.row.instructions && (
                <p className="font-body text-[13px] text-muted-foreground leading-snug mt-1 [overflow-wrap:anywhere]">
                  {current.row.instructions}
                </p>
              )}
              {current.product && (
                <p className="font-body text-[12px] text-muted-foreground mt-1 break-words [overflow-wrap:anywhere]">
                  Uses {current.product.product_name}
                </p>
              )}
            </div>

            {pending.length > 1 && (
              <p className="font-body text-[12px] text-muted-foreground">
                {pending.length - 1} more due today after this one.
              </p>
            )}

            {hasPlus && (
              <>
                {/* One tap logs it. Any extra step here is what kills adherence. */}
                <Button
                  className="w-full rounded-pill"
                  disabled={log.isPending}
                  onClick={() =>
                    log.mutate(
                      {
                        planId: current.plan.id,
                        scheduleId: current.row.id,
                        slot: current.slot,
                        status: "completed",
                      },
                      { onError: () => toast.error("Couldn't save that just now — try again") },
                    )
                  }
                >
                  Log this step
                </Button>
                <button
                  onClick={() => setLogging(true)}
                  className="w-full font-body text-[12.5px] text-primary min-h-[36px]"
                >
                  Log it with a note
                </button>
                <button
                  onClick={() => onSkip(current.plan.id, current.row.id, current.slot)}
                  className="w-full font-body text-[13px] text-muted-foreground min-h-[40px]"
                >
                  {skipLabel(current.slot)}
                </button>
              </>
            )}
          </div>
        )}

        {/* STARTING POINT — her own first check-in, previewed as soon as it
            exists: the words she wrote (or the voice note written out for her)
            plus the photos she attached that day. */}
        {startingPointRow && (
          <button
            type="button"
            onClick={() =>
              navigate(`/treatment/${plan.id}/checkin/${startingPointRow.week_number}`)
            }
            className="w-full text-left rounded-[12px] border border-border bg-secondary/40 px-3 py-2.5 space-y-2"
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-semibold">
              Where you started
            </p>
            {startingPointRow.written_note?.trim() ? (
              <p className="font-body text-[12.5px] leading-snug text-foreground/85 line-clamp-4 [overflow-wrap:anywhere] whitespace-pre-line">
                “{startingPointRow.written_note.trim()}”
              </p>
            ) : (
              <p className="font-body text-[12.5px] text-muted-foreground">
                {startingPhotos.length > 0
                  ? "Your first photos are saved here."
                  : "Your first check-in is saved."}
              </p>
            )}
            {startingPhotos.length > 0 && (
              <div className="flex gap-1.5">
                {startingPhotos.map((p) => {
                  const url = startingUrls[p.storage_path];
                  return url ? (
                    <img
                      key={p.id}
                      src={url}
                      alt=""
                      loading="lazy"
                      className="size-14 rounded-[10px] object-cover border border-border/60 bg-secondary"
                    />
                  ) : (
                    <span
                      key={p.id}
                      className="size-14 rounded-[10px] bg-secondary border border-border/60"
                    />
                  );
                })}
              </div>
            )}
            <p className="font-body text-[11px] text-primary">Read it again</p>
          </button>
        )}


        {/* THE OPEN CHECK-IN — merged in, never a second card. */}
        {checkinForThisPlan && (
          <div className="rounded-[12px] border border-primary/30 bg-primary/5 px-3 py-3 space-y-2">
            <p className="flex items-center gap-1.5 font-display text-[15px] leading-tight">
              <NotebookPen className="size-4 text-primary shrink-0" />
              {checkinIsDayOne
                ? "Where you're starting from"
                : checkinForThisPlan.cycle.startWeek === checkinForThisPlan.cycle.closingWeek
                  ? `Week ${checkinForThisPlan.cycle.closingWeek} check-in`
                  : `Weeks ${checkinForThisPlan.cycle.startWeek}–${checkinForThisPlan.cycle.closingWeek} check-in`}
            </p>
            <p className="font-body text-[12.5px] text-muted-foreground leading-snug">
              {checkinIsDayOne
                ? "A few words on your hair today gives you something to measure against later."
                : checkinForThisPlan.state === "missed"
                  ? "Still open whenever you have a minute."
                  : "Two minutes on how it's going keeps the picture accurate."}
            </p>
            <Button
              variant="outline"
              className="w-full rounded-pill"
              onClick={() => navigate(checkinForThisPlan.path)}
            >
              {checkinIsDayOne ? "Write my starting point" : "Do my check-in"}
            </Button>
            <button
              onClick={skipCheckin}
              className="w-full font-body text-[12px] text-muted-foreground min-h-[32px]"
            >
              Skip this one
            </button>
          </div>
        )}

        <TreatmentStreak streak={streak} days={days} />

        {hasPlus && lastLogged?.entry && (
          <div className="flex items-center justify-between gap-2">
            <p className="font-body text-[12px] text-muted-foreground min-w-0 truncate">
              {lastLogged.entry.status === "completed" ? "Logged" : "Skipped"}:{" "}
              {lastLogged.row.task_name}
            </p>
            <button
              onClick={() =>
                undo.mutate(
                  { entryId: lastLogged.entry!.id },
                  { onError: () => toast.error("Couldn't undo that just now") },
                )
              }
              className="font-body text-[12px] text-primary shrink-0 min-h-[36px] px-1 inline-flex items-center gap-1"
            >
              <RotateCcw className="size-3" />
              Undo
            </button>
          </div>
        )}

        {streakLine && (
          <p className="font-body text-[12px] text-muted-foreground">{streakLine}</p>
        )}
          </>
        )}
      </SurfaceCard>


      {current && (
        <StepLogSheet
          open={logging}
          onOpenChange={setLogging}
          taskName={current.row.task_name}
          slot={current.slot}
          instructions={current.row.instructions}
          saving={log.isPending}
          onSave={(note) =>
            log.mutate(
              {
                planId: current.plan.id,
                scheduleId: current.row.id,
                slot: current.slot,
                status: "completed",
                note,
              },
              {
                onSuccess: () => {
                  setLogging(false);
                  toast.success("Logged");
                },
                onError: () => toast.error("Couldn't save that just now — try again"),
              },
            )
          }
        />
      )}
    </div>
  );
};

export default TodayTreatmentCard;
