// ADMIN — author clarifications.
//
// The author's current positions. They are retrieved into every hair care
// generation and they OVERRIDE the manuscript where the two differ, so this
// screen is how a position changes without a code change.
//
// Deactivating never deletes: the record stays for the audit trail.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import { smartBack } from "@/lib/smartBack";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Clarification {
  id: string;
  topic: string;
  position: string;
  applies_to: string[] | null;
  is_active: boolean;
  sort_order: number;
  updated_at: string;
}

const humanTopic = (topic: string) =>
  topic
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

const AdminAuthorClarifications = () => {
  const nav = useNavigate();
  const [rows, setRows] = useState<Clarification[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [position, setPosition] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("author_clarifications")
      .select("id, topic, position, applies_to, is_active, sort_order, updated_at")
      .order("sort_order", { ascending: true });
    if (error) {
      toast({ title: "Could not load clarifications", description: error.message });
      setRows([]);
      return;
    }
    setRows((data ?? []) as Clarification[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const activeCount = useMemo(
    () => (rows ?? []).filter((r) => r.is_active).length,
    [rows],
  );

  const reset = () => {
    setEditingId(null);
    setTopic("");
    setPosition("");
  };

  const save = async () => {
    const t = topic.trim();
    const p = position.trim();
    if (!t || !p) {
      toast({ title: "Add a topic and the position" });
      return;
    }
    setSaving(true);
    const next = (rows ?? []).reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;
    const { error } = editingId
      ? await supabase
        .from("author_clarifications")
        .update({ topic: t, position: p })
        .eq("id", editingId)
      : await supabase
        .from("author_clarifications")
        .insert({ topic: t, position: p, sort_order: next });
    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message });
      return;
    }
    toast({ title: editingId ? "Clarification updated" : "Clarification added" });
    reset();
    void load();
  };

  const toggle = async (row: Clarification) => {
    const { error } = await supabase
      .from("author_clarifications")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) {
      toast({ title: "Could not update", description: error.message });
      return;
    }
    void load();
  };

  const move = async (row: Clarification, dir: -1 | 1) => {
    const list = [...(rows ?? [])];
    const i = list.findIndex((r) => r.id === row.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = list[i];
    const b = list[j];
    const { error } = await supabase
      .from("author_clarifications")
      .upsert([
        { id: a.id, topic: a.topic, position: a.position, sort_order: b.sort_order },
        { id: b.id, topic: b.topic, position: b.position, sort_order: a.sort_order },
      ]);
    if (error) {
      toast({ title: "Could not reorder", description: error.message });
      return;
    }
    void load();
  };

  return (
    <ScreenLayout>
      <TitleBar title="Author clarifications" onBack={() => smartBack(nav, "/admin")} />

      <SurfaceCard className="space-y-2">
        <p className="font-body text-[13px] leading-relaxed text-foreground/75">
          These are your current positions. They are used in every piece of hair
          guidance the app writes, and where one of them differs from the book,
          your clarification is the one that governs.
        </p>
        <p className="font-body text-[12px] text-foreground/55">
          {activeCount} in use
        </p>
      </SurfaceCard>

      <SectionLabel>{editingId ? "Edit clarification" : "Add a clarification"}</SectionLabel>
      <SurfaceCard className="space-y-3">
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic, e.g. protective_style_washing"
        />
        <Textarea
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder="Your position, in your own words"
          rows={5}
        />
        <div className="flex gap-2">
          <Button className="rounded-pill flex-1" onClick={save} disabled={saving}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Add clarification"}
          </Button>
          {editingId && (
            <Button variant="outline" className="rounded-pill" onClick={reset}>
              Cancel
            </Button>
          )}
        </div>
      </SurfaceCard>

      <SectionLabel>Clarifications</SectionLabel>
      {rows === null ? (
        <LoadingDot />
      ) : rows.length === 0 ? (
        <EmptyState message="No clarifications yet" hint="Add your first position above." />
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <SurfaceCard key={row.id} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-[16px] leading-tight text-foreground">
                    {humanTopic(row.topic)}
                  </p>
                  <p className="font-body text-[11px] text-foreground/50">
                    {row.is_active ? "In use" : "Not in use"}
                  </p>
                </div>
                <Switch checked={row.is_active} onCheckedChange={() => toggle(row)} />
              </div>
              <p className="font-body text-[13px] leading-relaxed text-foreground/80 [overflow-wrap:anywhere]">
                {row.position}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-pill"
                  onClick={() => {
                    setEditingId(row.id);
                    setTopic(row.topic);
                    setPosition(row.position);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-pill"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(row, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-pill"
                  aria-label="Move down"
                  disabled={i === rows.length - 1}
                  onClick={() => move(row, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            </SurfaceCard>
          ))}
        </div>
      )}
    </ScreenLayout>
  );
};

export default AdminAuthorClarifications;
