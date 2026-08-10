import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useProClients } from "@/hooks/useProClients";
import {
  useAssignTemplate,
  useProTemplates,
  useSaveTemplate,
  type TemplateStepDraft,
} from "@/hooks/useProTreatment";
import { DAY_LABELS, defaultMilestoneWeeks } from "@/lib/treatmentSchedule";

const CADENCES: { key: TemplateStepDraft["cadence"]; label: string }[] = [
  { key: "daily", label: "Every day" },
  { key: "specific_days", label: "Certain days" },
  { key: "weekly", label: "Weekly" },
];

const TIMES: { key: TemplateStepDraft["time_of_day"]; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "evening", label: "Evening" },
  { key: "both", label: "Both" },
];

const blankStep = (): TemplateStepDraft => ({
  task_name: "",
  instructions: "",
  cadence: "daily",
  days_of_week: [],
  time_of_day: "evening",
});

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
      "rounded-pill px-3 py-1.5 font-body text-[12px] border",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card text-foreground/80 border-border",
    )}
  >
    {children}
  </button>
);

/** Template builder, plus assigning it to a client or an email address. */
const ProTreatmentTemplate = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const isNew = !id || id === "new";
  const { templates } = useProTemplates();
  const existing = templates.find((t) => t.id === id) ?? null;
  const save = useSaveTemplate();
  const assign = useAssignTemplate();
  const { data: proClients = [] } = useProClients();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [weeks, setWeeks] = useState(8);
  const [steps, setSteps] = useState<TemplateStepDraft[]>([blankStep()]);
  const [photoWeeks, setPhotoWeeks] = useState<number[]>(defaultMilestoneWeeks(8));
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : (id ?? null));
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setDescription(existing.description ?? "");
    setWeeks(existing.duration_weeks);
    setSteps(existing.steps.length ? existing.steps : [blankStep()]);
    setPhotoWeeks(existing.milestone_weeks ?? []);
    setSavedId(existing.id);
  }, [existing]);

  const weekOptions = useMemo(
    () => Array.from({ length: Math.max(1, weeks) }, (_, i) => i + 1),
    [weeks],
  );

  const updateStep = (i: number, patch: Partial<TemplateStepDraft>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const onSave = () => {
    if (!title.trim()) return toast("Give the template a name first");
    const clean = steps.filter((s) => s.task_name.trim());
    if (!clean.length) return toast("Add at least one step");
    save.mutate(
      {
        id: savedId ?? undefined,
        title,
        description,
        duration_weeks: weeks,
        milestone_weeks: photoWeeks.filter((w) => w <= weeks),
        steps: clean,
      },
      {
        onSuccess: (newId) => {
          setSavedId(newId);
          toast.success("Template saved");
        },
        onError: () => toast.error("Couldn't save that just now"),
      },
    );
  };

  const doAssign = (clientUserId?: string) => {
    if (!savedId) return toast("Save the template first");
    assign.mutate(
      { templateId: savedId, clientUserId, email: clientUserId ? undefined : email.trim() },
      {
        onSuccess: () => {
          setEmail("");
          toast.success("Invitation sent — they'll be asked to accept it");
          nav("/pro/treatment");
        },
        onError: () => toast.error("Couldn't send that invitation"),
      },
    );
  };

  return (
    <ScreenLayout>
      <TitleBar title={isNew ? "New template" : "Template"} backFallback="/pro/treatment" />

      <div className="px-5 pt-1 pb-10 space-y-4">
        <SurfaceCard className="space-y-3">
          <div>
            <SectionLabel className="px-0 mt-0 mb-1.5">Name</SectionLabel>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Twelve-week scalp reset"
              maxLength={80}
            />
          </div>
          <div>
            <SectionLabel className="px-0 mt-0 mb-1.5">What it's for</SectionLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder="A line or two your client will read."
            />
          </div>
          <div>
            <SectionLabel className="px-0 mt-0 mb-1.5">Length</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {[4, 8, 12, 16].map((w) => (
                <Chip key={w} active={weeks === w} onClick={() => setWeeks(w)}>
                  {w} weeks
                </Chip>
              ))}
            </div>
          </div>
        </SurfaceCard>

        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">Steps</SectionLabel>
          {steps.map((s, i) => (
            <SurfaceCard key={i} className="space-y-3">
              <div className="flex items-start gap-2">
                <Input
                  value={s.task_name}
                  onChange={(e) => updateStep(i, { task_name: e.target.value })}
                  placeholder="What they do"
                  maxLength={80}
                />
                {steps.length > 1 && (
                  <button
                    type="button"
                    aria-label="Remove step"
                    onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                    className="size-9 rounded-full border border-border flex items-center justify-center shrink-0 text-muted-foreground"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <Textarea
                value={s.instructions}
                onChange={(e) => updateStep(i, { instructions: e.target.value })}
                rows={2}
                maxLength={300}
                placeholder="How to do it (optional)"
              />
              <div className="flex flex-wrap gap-1.5">
                {CADENCES.map((c) => (
                  <Chip
                    key={c.key}
                    active={s.cadence === c.key}
                    onClick={() => updateStep(i, { cadence: c.key })}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
              {s.cadence === "specific_days" && (
                <div className="flex flex-wrap gap-1.5">
                  {DAY_LABELS.map((d, dayIdx) => (
                    <Chip
                      key={d}
                      active={s.days_of_week.includes(dayIdx)}
                      onClick={() =>
                        updateStep(i, {
                          days_of_week: s.days_of_week.includes(dayIdx)
                            ? s.days_of_week.filter((x) => x !== dayIdx)
                            : [...s.days_of_week, dayIdx].sort(),
                        })
                      }
                    >
                      {d}
                    </Chip>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {TIMES.map((t) => (
                  <Chip
                    key={t.key}
                    active={s.time_of_day === t.key}
                    onClick={() => updateStep(i, { time_of_day: t.key })}
                  >
                    {t.label}
                  </Chip>
                ))}
              </div>
            </SurfaceCard>
          ))}
          <Button
            variant="outline"
            className="rounded-pill w-full"
            onClick={() => setSteps((prev) => [...prev, blankStep()])}
          >
            <Plus className="size-4 mr-1.5" /> Add a step
          </Button>
        </div>

        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">Weeks that prompt a photo</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {weekOptions.map((w) => (
              <Chip
                key={w}
                active={photoWeeks.includes(w)}
                onClick={() =>
                  setPhotoWeeks((prev) =>
                    prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w].sort((a, b) => a - b),
                  )
                }
              >
                {w}
              </Chip>
            ))}
          </div>
        </div>

        <Button className="rounded-pill w-full" onClick={onSave} disabled={save.isPending}>
          Save template
        </Button>

        <div className="space-y-2">
          <SectionLabel className="px-0 mt-0 mb-1.5">Assign to a client</SectionLabel>
          <SurfaceCard>
            <p className="font-body text-[13px] text-muted-foreground leading-snug">
              {PLUS_ASSIGN_NOTE} They also have to accept the plan before you can see anything they
              record. Sharing photos, videos and voice notes is a separate choice they make, and
              they can change it at any time.
            </p>
          </SurfaceCard>
          {clientsLoading ? null : plusClients.length === 0 ? (
            <SurfaceCard>
              <p className="font-body text-[13px] text-muted-foreground leading-snug">
                {PLUS_ASSIGN_EMPTY}
              </p>
            </SurfaceCard>
          ) : (
            <div className="space-y-1.5">
              {plusClients.map((c) => (
                <SurfaceCard
                  key={c.user_id}
                  padded={false}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  <p className="font-body text-[14px] flex-1 min-w-0 [overflow-wrap:anywhere]">
                    {c.name}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-pill shrink-0"
                    disabled={!savedId || assign.isPending}
                    onClick={() => doAssign(c.user_id)}
                  >
                    Assign
                  </Button>
                </SurfaceCard>
              ))}
            </div>
          )}
          <SurfaceCard className="space-y-2">
            <p className="font-body text-[13px] font-semibold">Not on STRAND yet?</p>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              inputMode="email"
              placeholder="their@email.com"
            />
            <p className="font-body text-[12px] text-muted-foreground leading-snug">
              The invitation waits for them and appears as soon as they join with that address. They
              will need STRAND+ to accept it, so the plan stays pending until they have it.
            </p>
            <Button
              variant="outline"
              className="rounded-pill w-full"
              disabled={!savedId || !email.trim() || assign.isPending}
              onClick={() => doAssign()}
            >
              Send invitation
            </Button>
          </SurfaceCard>
        </div>
      </div>
    </ScreenLayout>
  );
};

export default ProTreatmentTemplate;
