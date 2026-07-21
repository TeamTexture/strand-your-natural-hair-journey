import { useState } from "react";
import { Pencil, Trash2, ShieldCheck, Save, X, Plus } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import LoadingDot from "@/components/LoadingDot";
import { formatRelative } from "@/lib/formatPassportDate";
import {
  useProClientNotes,
  useAddProClientNote,
  useUpdateProClientNote,
  useDeleteProClientNote,
} from "@/hooks/useProClientNotes";
import { toast } from "sonner";

interface Props {
  consumerId: string;
  /** Optional short banner shown at the top — e.g. an access-ended reminder. */
  banner?: React.ReactNode;
}

/**
 * Pro-only private notes for a specific client. RLS ensures only the
 * authoring pro can read/write these; the consumer never sees them and
 * admins are excluded. Kept deliberately spartan — just the writing surface.
 */
const ProClientNotes = ({ consumerId, banner }: Props) => {
  const { data: notes = [], isLoading } = useProClientNotes(consumerId);
  const add = useAddProClientNote();
  const update = useUpdateProClientNote();
  const del = useDeleteProClientNote();

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const submitAdd = async () => {
    if (!draft.trim()) return;
    try {
      await add.mutateAsync({ consumerId, note: draft });
      setDraft("");
      toast.success("Note saved");
    } catch (e) {
      toast.error((e as Error).message ?? "Could not save note");
    }
  };

  const submitEdit = async (id: string) => {
    try {
      await update.mutateAsync({ id, note: editingText, consumerId });
      setEditingId(null);
      setEditingText("");
      toast.success("Note updated");
    } catch (e) {
      toast.error((e as Error).message ?? "Could not update note");
    }
  };

  const submitDelete = async (id: string) => {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    try {
      await del.mutateAsync({ id, consumerId });
      toast.success("Note deleted");
    } catch (e) {
      toast.error((e as Error).message ?? "Could not delete note");
    }
  };

  return (
    <div className="px-5 pt-2 pb-6 space-y-4">
      {banner}

      <SurfaceCard tone="gold">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-[0.16em] font-body font-semibold text-primary">
              Private — only visible to you
            </p>
            <p className="text-[12px] font-body text-foreground/75 leading-snug mt-1">
              Your working notes on this client. They stay yours even if this
              client later revokes access. Never shared with the client, other
              professionals, or admins.
            </p>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <p className="text-[10.5px] uppercase tracking-wider text-primary font-body font-semibold mb-2">
          New note
        </p>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Consultation observations, plan, follow-ups…"
          rows={4}
          className="text-[13px] font-body"
        />
        <div className="flex justify-end mt-2">
          <Button
            size="sm"
            onClick={submitAdd}
            disabled={!draft.trim() || add.isPending}
            className="rounded-pill"
          >
            <Plus className="size-3.5 mr-1" />
            {add.isPending ? "Saving…" : "Add note"}
          </Button>
        </div>
      </SurfaceCard>

      {isLoading ? (
        <LoadingDot label="Loading notes…" fullScreen={false} />
      ) : notes.length === 0 ? (
        <p className="text-center text-[12px] font-body text-muted-foreground py-4">
          No private notes yet.
        </p>
      ) : (
        <div className="space-y-2.5">
          {notes.map((n) => {
            const isEditing = editingId === n.id;
            return (
              <SurfaceCard key={n.id}>
                {isEditing ? (
                  <>
                    <Textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      rows={4}
                      className="text-[13px] font-body"
                    />
                    <div className="flex items-center justify-end gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          setEditingText("");
                        }}
                      >
                        <X className="size-3.5 mr-1" /> Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => submitEdit(n.id)}
                        disabled={update.isPending || !editingText.trim()}
                        className="rounded-pill"
                      >
                        <Save className="size-3.5 mr-1" />
                        {update.isPending ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] font-body leading-relaxed whitespace-pre-wrap text-foreground/90">
                      {n.note}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground font-body">
                        {formatRelative(n.created_at)}
                        {n.updated_at && n.updated_at !== n.created_at
                          ? " · edited"
                          : ""}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(n.id);
                            setEditingText(n.note);
                          }}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                          aria-label="Edit note"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => submitDelete(n.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          aria-label="Delete note"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </SurfaceCard>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProClientNotes;
