import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STYLE_GROUPS } from "@/lib/hairstyles";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useJournalSteps } from "@/hooks/useJournalSteps";
import JournalStepCard from "@/components/journal/JournalStepCard";
import EmptyState from "@/components/EmptyState";

/**
 * The style record. Two screens, nothing else.
 *
 *  Screen one (`/journal/entry/new`) — name the style and set the date.
 *  Screen two (`/journal/entry/<uuid>`) — numbered steps. Each step holds a
 *  short note, photos, videos (device or recorded), a voice note and products.
 */

const OTHER = "__other__";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const todayIso = () => new Date().toISOString().slice(0, 10);

const prettyDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

/** Screen one — start a style. Style and date. Nothing else. */
const StartStyleRecord = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const knownStyles = useMemo(() => STYLE_GROUPS.flatMap((g) => g.options), []);
  const [styleName, setStyleName] = useState("");
  const [freeText, setFreeText] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const start = async () => {
    if (!user) return;
    const name = styleName.trim();
    if (!name) {
      toast.error("Choose or type the style first");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("journal_entries")
      .insert({
        user_id: user.id,
        style_name: name,
        style_date: date,
        entry_date: date,
        status: "in_progress",
        title: name,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      console.error("start style record failed", error);
      toast.error("Couldn't start that style record");
      return;
    }
    navigate(`/journal/entry/${data.id}`, { replace: true });
  };

  return (
    <ScreenLayout>
      <TitleBar title="Start a style" backTo="/journal" />
      <div className="px-5 pb-10 space-y-4">
        <div className="rounded-[14px] border border-border bg-card p-3.5 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[13px]">Style</Label>
            {freeText ? (
              <div className="flex gap-2">
                <Input
                  value={styleName}
                  onChange={(e) => setStyleName(e.target.value)}
                  placeholder="Type the style"
                  className="h-10 text-sm"
                  maxLength={60}
                />
                <Button
                  type="button"
                  variant="goldGhost"
                  size="sm"
                  className="h-10 shrink-0"
                  onClick={() => { setFreeText(false); setStyleName(""); }}
                >
                  List
                </Button>
              </div>
            ) : (
              <Select
                value={knownStyles.includes(styleName) ? styleName : ""}
                onValueChange={(v) => {
                  if (v === OTHER) { setFreeText(true); setStyleName(""); return; }
                  setStyleName(v);
                }}
              >
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Choose a style" />
                </SelectTrigger>
                <SelectContent className="max-h-[50vh]">
                  {STYLE_GROUPS.map((g) => (
                    <div key={g.label}>
                      <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {g.label}
                      </p>
                      {g.options.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </div>
                  ))}
                  <SelectItem value={OTHER}>Something else…</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px]">Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayIso())}
              className="h-10 text-sm"
            />
          </div>
        </div>

        <Button
          type="button"
          variant="gold"
          size="pill"
          className="w-full"
          disabled={saving}
          onClick={() => void start()}
        >
          {saving ? "Starting…" : "Start"}
        </Button>
      </div>
    </ScreenLayout>
  );
};

interface EntryRow {
  id: string;
  style_name: string | null;
  style_date: string | null;
  status: string | null;
}

/** Screen two — the numbered steps. */
const StyleRecordSteps = ({ entryId }: { entryId: string }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [entry, setEntry] = useState<EntryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const {
    steps,
    loading: stepsLoading,
    addStep,
    updateStep,
    deleteStep,
    moveStep,
    addMedia,
    removeMedia,
    toggleProduct,
  } = useJournalSteps(entryId);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("id, style_name, style_date, status")
        .eq("id", entryId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setEntry((data as EntryRow) ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [entryId, user]);

  // A product added by pasting a link leaves the app to the analysis screen and
  // returns with the new `user_products` id plus the step it belongs to.
  useEffect(() => {
    const stepId = new URLSearchParams(location.search).get("addToStep");
    const productId = (location.state as { journalAddProductId?: string } | null)?.journalAddProductId;
    if (!stepId || !productId) return;
    void toggleProduct(stepId, productId).then(() => toast.success("Product added to this step"));
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate, toggleProduct]);

  const complete = entry?.status === "complete";

  const setStatus = async (status: "in_progress" | "complete") => {
    if (!entry) return;
    setEntry({ ...entry, status });
    const { error } = await supabase.from("journal_entries").update({ status }).eq("id", entry.id);
    if (error) {
      console.error("style record status save failed", error);
      toast.error("Couldn't save that");
      return;
    }
    if (status === "complete") navigate("/journal");
  };

  if (loading) {
    return (
      <ScreenLayout>
        <TitleBar title="Style record" backTo="/journal" />
      </ScreenLayout>
    );
  }

  if (!entry) {
    return (
      <ScreenLayout>
        <TitleBar title="Style record" backTo="/journal" />
        <div className="px-5">
          <EmptyState message="That style record isn't there" hint="It may have been deleted." />
        </div>
      </ScreenLayout>
    );
  }

  const dateLabel = prettyDate(entry.style_date);

  return (
    <ScreenLayout>
      <TitleBar title={entry.style_name || "Style record"} backTo="/journal" />
      <div className="px-5 pb-10 space-y-3">
        {dateLabel && (
          <p className="text-[11px] text-muted-foreground">{dateLabel}</p>
        )}

        {stepsLoading && steps.length === 0 ? null : steps.length === 0 ? (
          <EmptyState
            message="No steps yet"
            hint="Add step 1 for the first thing you did, then keep going."
          />
        ) : (
          <div className="space-y-2.5">
            {steps.map((s, i) => (
              <JournalStepCard
                key={s.id}
                step={s}
                index={i}
                total={steps.length}
                editing={!complete}
                onUpdate={(patch) => void updateStep(s.id, patch)}
                onDelete={() => void deleteStep(s.id)}
                onMove={(dir) => void moveStep(s.id, dir)}
                onAddMedia={(m) => void addMedia(s.id, m)}
                onRemoveMedia={(id) => void removeMedia(id)}
                onToggleProduct={(pid) => void toggleProduct(s.id, pid)}
              />
            ))}
          </div>
        )}

        {!complete && (
          <Button
            type="button"
            variant="goldOutline"
            size="pill"
            className="w-full"
            onClick={() => void addStep()}
          >
            <Plus className="size-4 mr-1.5" /> Add step {steps.length + 1}
          </Button>
        )}

        <Button
          type="button"
          variant={complete ? "goldGhost" : "gold"}
          size="pill"
          className="w-full"
          onClick={() => void setStatus(complete ? "in_progress" : "complete")}
        >
          {complete ? (
            <><RotateCcw className="size-4 mr-1.5" /> Add more steps</>
          ) : (
            <><CheckCircle2 className="size-4 mr-1.5" /> Done</>
          )}
        </Button>
      </div>
    </ScreenLayout>
  );
};

const StyleRecord = () => {
  const { id = "" } = useParams();
  if (id === "new" || !UUID_RE.test(id)) return <StartStyleRecord />;
  return <StyleRecordSteps entryId={id} />;
};

export default StyleRecord;
