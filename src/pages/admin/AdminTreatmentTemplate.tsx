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
import {
  useAdminMemberOptions,
  useAdminTemplates,
  useAssignAdminTemplate,
  useSaveAdminTemplate,
  type AdminTemplateStep,
} from "@/hooks/useAdminTreatment";
import { DAY_LABELS, defaultMilestoneWeeks } from "@/lib/treatmentSchedule";

const CADENCES: { key: AdminTemplateStep["cadence"]; label: string }[] = [
  { key: "daily", label: "Every day" },
  { key: "specific_days", label: "Certain days" },
  { key: "weekly", label: "Weekly" },
];

const TIMES: { key: AdminTemplateStep["time_of_day"]; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "evening", label: "Evening" },
  { key: "both", label: "Both" },
];

const blankStep = (): AdminTemplateStep => ({
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

/** Admin-owned template builder, plus assigning it to any member or an email. */
const AdminTreatmentTemplate = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const isNew = !id || id === "new";
  const { templates } = useAdminTemplates();
  const existing = templates.find((t) => t.id === id) ?? null;
  const save = useSaveAdminTemplate();
  const assign = useAssignAdminTemplate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [weeks, setWeeks] = useState(8);
  const [steps, setSteps] = useState<AdminTemplateStep[]>([blankStep()]);
  const [photoWeeks, setPhotoWeeks] = useState<number[]>(defaultMilestoneWeeks(8));
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : (id ?? null));
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const { clients: plusMembers, loading: membersLoading } = useAssignableClients();

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

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plusMembers.slice(0, 8);
    return plusMembers
      .filter((m) => m.name.toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [plusMembers, search]);

  const updateStep = (i: number, patch: Partial<AdminTemplateStep>) =>
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
          setSearch("");
          toast.success("Invitation sent — they'll be asked to accept it");
          nav("/admin/treatment");
        },
        onError: () => toast.error("Couldn't send that invitation"),
      },
    );
  };

  return (
    <ScreenLayout>
      <TitleBar
        title={isNew ? "New STRAND template" : "STRAND template"}
        backFallback="/admin/treatment"
      />

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
              placeholder="A line or two the member will read."
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
                    prev.includes(w)
                      ? prev.filter((x) => x !== w)
                      : [...prev, w].sort((a, b) => a - b),
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
          <SectionLabel className="px-0 mt-0 mb-1.5">Assign to a member</SectionLabel>
          <SurfaceCard>
            <p className="font-body text-[13px] text-muted-foreground leading-snug">
              The member needs STRAND+ (£14.99/mo) to accept and follow a plan — reading it is free.
              They have to accept the plan first. Photos, videos and voice notes stay private
              unless they separately choose to share them.
            </p>
          </SurfaceCard>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members by name or email"
          />
          {matches.map((m) => (
            <button key={m.user_id} className="w-full text-left" onClick={() => doAssign(m.user_id)}>
              <SurfaceCard className="py-3">
                <p className="font-display text-[14px] leading-tight [overflow-wrap:anywhere]">
                  {m.name}
                </p>
                {m.email && (
                  <p className="font-body text-[12px] text-muted-foreground [overflow-wrap:anywhere]">
                    {m.email}
                  </p>
                )}
              </SurfaceCard>
            </button>
          ))}

          <SurfaceCard className="space-y-2">
            <SectionLabel className="px-0 mt-0 mb-0">Or invite by email</SectionLabel>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="name@example.com"
            />
            <p className="font-body text-[12px] text-muted-foreground leading-snug">
              If they're not on STRAND yet, the invitation waits and resolves when they sign up.
            </p>
            <Button
              variant="outline"
              className="rounded-pill w-full"
              disabled={!email.trim() || assign.isPending}
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

export default AdminTreatmentTemplate;
