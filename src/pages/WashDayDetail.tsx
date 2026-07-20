import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Pencil,
  Trash2,
  Droplets,
  Scissors,
  Flame,
  Heart,
  Gauge,
  Clock,
  Package,
  ListOrdered,
  Sparkles,
  Mic,
  CalendarDays,
} from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { WashDay } from "@/hooks/useWashDays";
import { toast } from "sonner";
import AddToCalendarButton from "@/components/AddToCalendarButton";
import { NextWashTipCard } from "@/components/NextWashTipCard";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
};

const daysAgoLabel = (iso: string) => {
  const then = new Date(iso).setHours(0, 0, 0, 0);
  const now = new Date().setHours(0, 0, 0, 0);
  const diff = Math.round((now - then) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 0) return `${diff} days ago`;
  if (diff === -1) return "Tomorrow";
  return `In ${-diff} days`;
};

const Stat = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex-1 min-w-0 rounded-2xl bg-primary/5 border border-primary/10 px-3 py-2.5 text-center">
    <Icon className="size-4 text-primary mx-auto mb-1" />
    <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mb-0.5">{label}</p>
    <p className="text-sm font-semibold leading-tight truncate">{value}</p>
  </div>
);

const Chip = ({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "alert" }) => {
  const tones: Record<string, string> = {
    neutral: "bg-muted text-foreground",
    good: "bg-[hsl(var(--good))]/15 text-[hsl(var(--good))]",
    warn: "bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]",
    alert: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
};

const scalpTone = (v: string | null): "good" | "warn" | "alert" | "neutral" => {
  if (!v) return "neutral";
  const s = v.toLowerCase();
  if (["clean", "balanced"].some((k) => s.includes(k))) return "good";
  if (["itchy", "tender", "dry", "flaky", "greasy"].some((k) => s.includes(k))) return "warn";
  return "neutral";
};
const breakageTone = (v: string | null): "good" | "warn" | "alert" | "neutral" => {
  if (!v) return "neutral";
  const s = v.toLowerCase();
  if (s.includes("none")) return "good";
  if (s.includes("minimal")) return "good";
  if (s.includes("moderate")) return "warn";
  if (s.includes("lot") || s.includes("concerned")) return "alert";
  return "neutral";
};
const stressTone = (v: number | null): "good" | "warn" | "alert" | "neutral" => {
  if (v == null) return "neutral";
  if (v <= 1) return "good";
  if (v <= 3) return "warn";
  return "alert";
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">{label}</p>
    <div className="text-sm">{value}</div>
  </div>
);

interface HeatTreatment {
  used?: boolean;
  product?: string;
  duration_min?: number;
  tools?: string[];
  tool_ids?: string[];
}
interface ProductLookup { id: string; name: string; brand: string | null }



interface EditDraft {
  wash_date: string;
  scalp_feel: string;
  breakage: string;
  style_after: string;
  duration_min: string;
  stress_level: string;
  hair_feel_note: string;
}

const draftFromWashDay = (wd: WashDay): EditDraft => ({
  wash_date: wd.wash_date,
  scalp_feel: wd.scalp_feel ?? "",
  breakage: wd.breakage ?? "",
  style_after: wd.style_after ?? "",
  duration_min: wd.duration_min != null ? String(wd.duration_min) : "",
  stress_level: wd.stress_level != null ? String(wd.stress_level) : "",
  hair_feel_note: wd.hair_feel_note ?? "",
});

const WashDayDetail = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [wd, setWd] = useState<WashDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("wash_days")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        const next = (data as unknown as WashDay) ?? null;
        setWd(next);
        if (next) setDraft(draftFromWashDay(next));
        if (data?.hair_feel_voice_url) {
          const { data: sig } = await supabase.storage
            .from("voicenotes")
            .createSignedUrl(data.hair_feel_voice_url, 3600);
          setVoiceUrl(sig?.signedUrl ?? null);
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, id]);

  const handleSave = async () => {
    if (!wd || !draft || !user) return;
    setSaving(true);
    try {
      const updates = {
        wash_date: draft.wash_date,
        scalp_feel: draft.scalp_feel.trim() || null,
        breakage: draft.breakage.trim() || null,
        style_after: draft.style_after.trim() || null,
        duration_min: draft.duration_min ? Number(draft.duration_min) : null,
        stress_level: draft.stress_level ? Number(draft.stress_level) : null,
        hair_feel_note: draft.hair_feel_note.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("wash_days")
        .update(updates)
        .eq("id", wd.id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) throw error;
      setWd(data as unknown as WashDay);
      setDraft(draftFromWashDay(data as unknown as WashDay));
      setEditing(false);
      toast.success("Wash day updated");
    } catch (e) {
      console.error("wash_days update failed", e);
      toast.error(e instanceof Error ? e.message : "Couldn't save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!wd || !user) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("wash_days")
        .delete()
        .eq("id", wd.id)
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Wash day deleted");
      navigate("/wash-day");
    } catch (e) {
      console.error("wash_days delete failed", e);
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (loading) {
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Wash Day" back />
        <div className="px-5 py-8 text-sm text-muted-foreground">Loading…</div>
      </ScreenLayout>
    );
  }
  if (!wd) {
    return (
      <ScreenLayout bottomNav>
        <TitleBar title="Wash Day" back />
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">Wash day not found.</p>
          <Button variant="goldOutline" size="pill" onClick={() => navigate("/wash-day")}>
            ← Back to Wash Day
          </Button>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Wash Day" back />
      <div className="px-5 pb-8 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium">Logged</p>
            <h1 className="font-display text-xl font-bold">{fmtDate(wd.wash_date)}</h1>
          </div>
          {!editing && (
            <button
              onClick={() => { setDraft(draftFromWashDay(wd)); setEditing(true); }}
              className="flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-primary px-3 py-2 rounded-full border border-primary/30 hover:bg-primary/5"
              aria-label="Edit wash day"
            >
              <Pencil className="size-3.5" />
              Edit
            </button>
          )}
        </div>

        {!editing && (
          <AddToCalendarButton
            event={{
              title: "Wash Day",
              date: wd.wash_date,
              description: wd.steps?.length
                ? `Steps: ${wd.steps.map((s) => s.name).join(" · ")}`
                : undefined,
              uid: `washday-${wd.id}@strand.app`,
            }}
          />
        )}

        {wd.steps?.length > 0 && (
          <SurfaceCard padded={false} className="divide-y divide-border/60">
            <div className="p-3.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Steps
            </div>
            {wd.steps.map((s, i) => (
              <div key={i} className="p-3 flex items-start gap-3">
                <span className="size-6 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{s.name}</p>
                  {s.product_name && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Product: {s.product_name}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </SurfaceCard>
        )}

        {wd.heat_treatment && (
          <SurfaceCard>
            <Field
              label="Heat treatment"
              value={
                <span>
                  {wd.heat_treatment.product ?? "—"}
                  {wd.heat_treatment.duration_min != null &&
                    ` · ${wd.heat_treatment.duration_min} min`}
                </span>
              }
            />
          </SurfaceCard>
        )}

        {/* DETAILS — view or edit */}
        {editing && draft ? (
          <SurfaceCard className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium">
              Edit details
            </p>

            <div>
              <Label htmlFor="wash_date" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Date</Label>
              <Input
                id="wash_date"
                type="date"
                value={draft.wash_date}
                onChange={(e) => setDraft({ ...draft, wash_date: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="scalp" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Scalp feel</Label>
                <Input
                  id="scalp"
                  value={draft.scalp_feel}
                  onChange={(e) => setDraft({ ...draft, scalp_feel: e.target.value })}
                  placeholder="e.g. Calm"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="breakage" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Breakage</Label>
                <Input
                  id="breakage"
                  value={draft.breakage}
                  onChange={(e) => setDraft({ ...draft, breakage: e.target.value })}
                  placeholder="e.g. Minimal"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="style" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Style after</Label>
                <Input
                  id="style"
                  value={draft.style_after}
                  onChange={(e) => setDraft({ ...draft, style_after: e.target.value })}
                  placeholder="e.g. Twist-out"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="duration" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Duration (min)</Label>
                <Input
                  id="duration"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft.duration_min}
                  onChange={(e) => setDraft({ ...draft, duration_min: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="stress" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Stress level (1–5)</Label>
                <Input
                  id="stress"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={5}
                  value={draft.stress_level}
                  onChange={(e) => setDraft({ ...draft, stress_level: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="feel" className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Hair feel note</Label>
              <Textarea
                id="feel"
                value={draft.hair_feel_note}
                onChange={(e) => setDraft({ ...draft, hair_feel_note: e.target.value })}
                placeholder="How did your hair feel after this wash?"
                rows={3}
                className="mt-1"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="gold" size="pill" onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button
                variant="goldOutline"
                size="pill"
                onClick={() => { setDraft(draftFromWashDay(wd)); setEditing(false); }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </SurfaceCard>
        ) : (
          <SurfaceCard className="grid grid-cols-2 gap-4">
            {wd.scalp_feel && <Field label="Scalp feel" value={wd.scalp_feel} />}
            {wd.breakage && <Field label="Breakage" value={wd.breakage} />}
            {wd.style_after && <Field label="Style after" value={wd.style_after} />}
            {wd.duration_min != null && (
              <Field label="Duration" value={`${wd.duration_min} min`} />
            )}
            {wd.stress_level != null && (
              <Field label="Stress level" value={`${wd.stress_level}/5`} />
            )}
          </SurfaceCard>
        )}

        {!editing && (wd.hair_feel_note || voiceUrl) && (
          <SurfaceCard>
            <Field
              label="Hair feel"
              value={
                <div className="space-y-2">
                  {wd.hair_feel_note && (
                    <p className="text-sm leading-snug">{wd.hair_feel_note}</p>
                  )}
                  {voiceUrl && (
                    <audio controls src={voiceUrl} className="w-full" />
                  )}
                </div>
              }
            />
          </SurfaceCard>
        )}

        {wd.next_wash_tip && (() => {
          let action = wd.next_wash_tip;
          let why = "";
          try {
            const parsed = JSON.parse(wd.next_wash_tip);
            if (parsed && typeof parsed === "object" && (parsed.action || parsed.why)) {
              action = parsed.action ?? "";
              why = parsed.why ?? "";
            }
          } catch { /* legacy plain text */ }
          return <NextWashTipCard action={action} why={why} />;
        })()}

        {!editing && (
          <>
            <Button variant="goldOutline" size="pill" onClick={() => navigate("/wash-day")}>
              ← Back to Wash Day
            </Button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full mt-2 flex items-center justify-center gap-2 text-xs text-destructive py-2.5 rounded-full border border-destructive/30 hover:bg-destructive/5"
            >
              <Trash2 className="size-3.5" />
              Delete this wash day
            </button>
          </>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this wash day?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the entry from your history. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
  );
};

export default WashDayDetail;
