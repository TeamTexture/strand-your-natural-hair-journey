import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  useCreateTreatmentPlan,
  searchGlossary,
  type DraftProduct,
  type DraftStep,
} from "@/hooks/useTreatmentPlans";
import {
  DAY_LABELS,
  defaultMilestoneWeeks,
  toDateKey,
} from "@/lib/treatmentSchedule";

/** Segmented progress indicator — four steps, current one filled. */
const Segments = ({ step }: { step: number }) => (
  <div className="flex items-center gap-1.5 px-5 pb-1" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={4}>
    {[1, 2, 3, 4].map((i) => (
      <span
        key={i}
        className={cn(
          "h-1.5 flex-1 rounded-full transition-all",
          i < step ? "bg-primary/60" : i === step ? "bg-primary" : "bg-border",
        )}
      />
    ))}
  </div>
);

const Chip = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-pill border px-3 py-1.5 font-body text-[13px] transition-colors min-h-[38px]",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card text-foreground border-border",
    )}
  >
    {children}
  </button>
);

const DURATIONS = [4, 8, 12, 16, 24];

const emptyStep = (): DraftStep => ({
  task_name: "",
  instructions: "",
  cadence: "daily",
  days_of_week: [],
  time_of_day: "evening",
  productIndex: null,
});

const emptyProduct = (): DraftProduct => ({
  product_name: "",
  brand: "",
  usage_notes: "",
  ingredient_id: null,
});

const TreatmentPlanBuilder = () => {
  const navigate = useNavigate();
  const create = useCreateTreatmentPlan();

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [durationWeeks, setDurationWeeks] = useState(12);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [products, setProducts] = useState<DraftProduct[]>([emptyProduct()]);
  const [steps, setSteps] = useState<DraftStep[]>([emptyStep()]);
  const [milestoneWeeks, setMilestoneWeeks] = useState<number[]>(defaultMilestoneWeeks(12));
  const [checkinReminder, setCheckinReminder] = useState(true);

  // Glossary autocomplete state, keyed by product index.
  const [suggestions, setSuggestions] = useState<
    Record<number, { id: string; display_name: string }[]>
  >({});

  const setDuration = (weeks: number) => {
    setDurationWeeks(weeks);
    setMilestoneWeeks((prev) => {
      const kept = prev.filter((w) => w <= weeks);
      return kept.length ? kept : defaultMilestoneWeeks(weeks);
    });
  };

  const patchProduct = (i: number, patch: Partial<DraftProduct>) =>
    setProducts((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const patchStep = (i: number, patch: Partial<DraftStep>) =>
    setSteps((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const onProductNameChange = async (i: number, value: string) => {
    patchProduct(i, { product_name: value, ingredient_id: null });
    const found = await searchGlossary(value);
    setSuggestions((s) => ({ ...s, [i]: found }));
  };

  const namedProducts = useMemo(
    () => products.filter((p) => p.product_name.trim().length > 0),
    [products],
  );

  const canContinue =
    step === 1
      ? title.trim().length > 1
      : step === 3
        ? steps.some((s) => s.task_name.trim().length > 1)
        : true;

  const save = async () => {
    try {
      const cleanProducts = products.filter((p) => p.product_name.trim());
      // Re-point step product references at the filtered list.
      const indexMap = new Map<number, number>();
      products.forEach((p, i) => {
        if (p.product_name.trim()) indexMap.set(i, indexMap.size);
      });
      const planId = await create.mutateAsync({
        title,
        goal,
        duration_weeks: durationWeeks,
        start_date: toDateKey(startDate),
        products: cleanProducts,
        steps: steps
          .filter((s) => s.task_name.trim())
          .map((s) => ({
            ...s,
            productIndex:
              s.productIndex != null && indexMap.has(s.productIndex)
                ? (indexMap.get(s.productIndex) as number)
                : null,
          })),
        milestoneWeeks,
        checkinReminder,
      });
      toast.success("Your plan is live");
      navigate(`/treatment/${planId}`, { replace: true });
    } catch (e) {
      console.error("treatment plan create failed", e);
      toast.error("Couldn't save your plan just now — try again");
    }
  };

  const heading = ["What are you doing and for how long", "Products", "When", "Photo milestones"][
    step - 1
  ];

  return (
    <ScreenLayout>
      <TitleBar title="New treatment plan" right={`${step} of 4`} backFallback="/home" />
      <Segments step={step} />

      <div className="px-5 pt-2 pb-8 space-y-4">
        <h1 className="font-display text-[22px] leading-tight">{heading}</h1>

        {/* ---------------------------------------------------------- step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            <SurfaceCard className="space-y-3">
              <div className="space-y-1.5">
                <SectionLabel className="px-0 mt-0 mb-1.5">Plan name</SectionLabel>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Scalp serum protocol"
                />
              </div>
              <div className="space-y-1.5">
                <SectionLabel className="px-0 mt-0 mb-1.5">What you're hoping for (optional)</SectionLabel>
                <Textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Calmer scalp along my partings"
                  rows={3}
                />
              </div>
            </SurfaceCard>

            <SurfaceCard className="space-y-3">
              <div className="space-y-2">
                <SectionLabel className="px-0 mt-0 mb-1.5">How long</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map((w) => (
                    <Chip key={w} active={durationWeeks === w} onClick={() => setDuration(w)}>
                      {w} weeks
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <SectionLabel className="px-0 mt-0 mb-1.5">Starting</SectionLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal rounded-pill">
                      <CalendarIcon className="size-4 mr-2" />
                      {format(startDate, "EEE d MMM yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(d) => d && setStartDate(d)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </SurfaceCard>
          </div>
        )}

        {/* ---------------------------------------------------------- step 2 */}
        {step === 2 && (
          <div className="space-y-3">
            {products.map((p, i) => (
              <SurfaceCard key={i} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <SectionLabel className="px-0 mt-0 mb-1.5">Product {i + 1}</SectionLabel>
                  {products.length > 1 && (
                    <button
                      onClick={() => setProducts((list) => list.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground min-h-[32px]"
                      aria-label="Remove product"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <Input
                  value={p.product_name}
                  onChange={(e) => void onProductNameChange(i, e.target.value)}
                  placeholder="Product or ingredient name"
                />
                {!p.ingredient_id && (suggestions[i]?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {suggestions[i].map((s) => (
                      <Chip
                        key={s.id}
                        active={false}
                        onClick={() => {
                          patchProduct(i, { ingredient_id: s.id, product_name: s.display_name });
                          setSuggestions((prev) => ({ ...prev, [i]: [] }));
                        }}
                      >
                        {s.display_name}
                      </Chip>
                    ))}
                  </div>
                )}
                {p.ingredient_id && (
                  <p className="font-body text-[12px] text-primary">Linked to your ingredient glossary</p>
                )}
                <Input
                  value={p.brand}
                  onChange={(e) => patchProduct(i, { brand: e.target.value })}
                  placeholder="Brand (optional)"
                />
                <Textarea
                  value={p.usage_notes}
                  onChange={(e) => patchProduct(i, { usage_notes: e.target.value })}
                  placeholder="How you use it — amount, where it goes"
                  rows={2}
                />
              </SurfaceCard>
            ))}
            <Button
              variant="outline"
              className="w-full rounded-pill"
              onClick={() => setProducts((list) => [...list, emptyProduct()])}
            >
              <Plus className="size-4 mr-1.5" /> Add another product
            </Button>
          </div>
        )}

        {/* ---------------------------------------------------------- step 3 */}
        {step === 3 && (
          <div className="space-y-3">
            {steps.map((s, i) => (
              <SurfaceCard key={i} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <SectionLabel className="px-0 mt-0 mb-1.5">Step {i + 1}</SectionLabel>
                  {steps.length > 1 && (
                    <button
                      onClick={() => setSteps((list) => list.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground min-h-[32px]"
                      aria-label="Remove step"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <Input
                  value={s.task_name}
                  onChange={(e) => patchStep(i, { task_name: e.target.value })}
                  placeholder="Apply scalp serum"
                />
                <Textarea
                  value={s.instructions}
                  onChange={(e) => patchStep(i, { instructions: e.target.value })}
                  placeholder="A few drops along each parting, then massage in"
                  rows={2}
                />

                <div className="space-y-2">
                  <SectionLabel className="px-0 mt-0 mb-1.5">How often</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    <Chip active={s.cadence === "daily"} onClick={() => patchStep(i, { cadence: "daily" })}>
                      Every day
                    </Chip>
                    <Chip
                      active={s.cadence === "specific_days"}
                      onClick={() => patchStep(i, { cadence: "specific_days" })}
                    >
                      Certain days
                    </Chip>
                    <Chip active={s.cadence === "weekly"} onClick={() => patchStep(i, { cadence: "weekly" })}>
                      Once a week
                    </Chip>
                  </div>
                </div>

                {s.cadence === "specific_days" && (
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_LABELS.map((label, d) => (
                      <Chip
                        key={d}
                        active={s.days_of_week.includes(d)}
                        onClick={() =>
                          patchStep(i, {
                            days_of_week: s.days_of_week.includes(d)
                              ? s.days_of_week.filter((x) => x !== d)
                              : [...s.days_of_week, d].sort(),
                          })
                        }
                      >
                        {label}
                      </Chip>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <SectionLabel className="px-0 mt-0 mb-1.5">Time of day</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {(["morning", "evening", "both"] as const).map((t) => (
                      <Chip key={t} active={s.time_of_day === t} onClick={() => patchStep(i, { time_of_day: t })}>
                        {t === "both" ? "Both" : t === "morning" ? "Morning" : "Evening"}
                      </Chip>
                    ))}
                  </div>
                </div>

                {namedProducts.length > 0 && (
                  <div className="space-y-2">
                    <SectionLabel className="px-0 mt-0 mb-1.5">Product used (optional)</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {products.map((p, pi) =>
                        p.product_name.trim() ? (
                          <Chip
                            key={pi}
                            active={s.productIndex === pi}
                            onClick={() => patchStep(i, { productIndex: s.productIndex === pi ? null : pi })}
                          >
                            {p.product_name}
                          </Chip>
                        ) : null,
                      )}
                    </div>
                  </div>
                )}
              </SurfaceCard>
            ))}

            <Button
              variant="outline"
              className="w-full rounded-pill"
              onClick={() => setSteps((list) => [...list, emptyStep()])}
            >
              <Plus className="size-4 mr-1.5" /> Add another step
            </Button>

            <SurfaceCard className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-body text-[14px] font-semibold">Remind me to check in</p>
                <p className="font-body text-[12px] text-muted-foreground">Sundays, by email.</p>
              </div>
              <Switch checked={checkinReminder} onCheckedChange={setCheckinReminder} />
            </SurfaceCard>
          </div>
        )}

        {/* ---------------------------------------------------------- step 4 */}
        {step === 4 && (
          <div className="space-y-3">
            <SurfaceCard className="space-y-3">
              <p className="font-body text-[13px] text-muted-foreground">
                Pick the weeks you'd like a photo prompt. Same light, same spot each time.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: durationWeeks }, (_, i) => i + 1).map((w) => (
                  <Chip
                    key={w}
                    active={milestoneWeeks.includes(w)}
                    onClick={() =>
                      setMilestoneWeeks((prev) =>
                        prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w].sort((a, b) => a - b),
                      )
                    }
                  >
                    {w}
                  </Chip>
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard tone="gold" className="space-y-1">
              <p className="font-display text-[16px]">{title || "Your plan"}</p>
              <p className="font-body text-[13px] text-muted-foreground">
                {durationWeeks} weeks from {format(startDate, "d MMM")} ·{" "}
                {steps.filter((s) => s.task_name.trim()).length} step
                {steps.filter((s) => s.task_name.trim()).length === 1 ? "" : "s"} ·{" "}
                {milestoneWeeks.length} photo prompt{milestoneWeeks.length === 1 ? "" : "s"}
              </p>
            </SurfaceCard>
          </div>
        )}

        {/* ------------------------------------------------------ navigation */}
        <div className="flex items-center gap-2 pt-2">
          {step > 1 && (
            <Button variant="outline" className="rounded-pill flex-1" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {step < 4 ? (
            <Button
              className="rounded-pill flex-1"
              disabled={!canContinue}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button className="rounded-pill flex-1" disabled={create.isPending} onClick={() => void save()}>
              {create.isPending ? "Saving…" : "Start my plan"}
            </Button>
          )}
        </div>
      </div>
    </ScreenLayout>
  );
};

export default TreatmentPlanBuilder;
