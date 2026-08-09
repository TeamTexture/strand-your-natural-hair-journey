import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Check, Link2, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserTools, TOOL_CATEGORIES, type UserTool } from "@/hooks/useUserTools";
import { supabase } from "@/integrations/supabase/client";
import { buildAiContext } from "@/lib/aiContext";
import { toast } from "sonner";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProductThumb from "@/components/ProductThumb";
import StarRating from "@/components/StarRating";
import ShelfItemRemoveDialog from "@/components/ShelfItemRemoveDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Currently attached tool IDs */
  selectedIds: string[];
  /** Called when the user taps a tool on/off */
  onToggle: (toolId: string) => void;
  /** Called after a brand-new tool is created here, so the parent can refresh
   * its own copy of the tools catalogue (otherwise the attached tool renders as
   * a nameless placeholder until the page reloads). */
  onToolsChanged?: () => void;
}

const Row = ({
  t,
  selected,
  onClick,
  onRemove,
}: {
  t: UserTool;
  selected: boolean;
  onClick: () => void;
  onRemove: () => void;
}) => (
  <div
    className={cn(
      "w-full p-3 flex items-center gap-3 rounded-[10px] border transition-colors",
      selected ? "border-primary bg-primary/5" : "border-border bg-card",
    )}
  >
    <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-3 text-left">
      <ProductThumb
        imageUrl={t.image_url}
        storagePath={t.storage_path}
        alt={t.name}
        cover
        wrapperClassName="size-10 rounded-[8px] overflow-hidden bg-secondary shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{t.name}</p>
        <div className="flex items-center gap-2 min-w-0">
          {t.brand && <p className="text-[11px] text-muted-foreground truncate">{t.brand}</p>}
          {typeof t.rating === "number" && t.rating > 0 && (
            <StarRating value={t.rating} size="size-3" />
          )}
        </div>
      </div>
      {selected && (
        <span className="size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <Check className="size-3" />
        </span>
      )}
    </button>
    <button
      type="button"
      aria-label={`Remove ${t.name}`}
      onClick={onRemove}
      className="shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="size-4" />
    </button>
  </div>
);


/**
 * Tool picker — the tools mirror of ProductPickerSheet. Pick from the tools the
 * member already owns or has wishlisted, or add a new one from a link (analysed
 * with `tool-analyse-url`, then saved to My Tools and attached straight away).
 */
const ToolPickerSheet = ({ open, onOpenChange, selectedIds, onToggle, onToolsChanged }: Props) => {
  const { tools: allTools, loading, addTool, updateTool, deleteTool } = useUserTools();
  const [tab, setTab] = useState<"owned" | "wishlist">("owned");
  const [showAdd, setShowAdd] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<UserTool | null>(null);
  const [removing, setRemoving] = useState(false);

  const owned = allTools.filter((t) => !t.on_wishlist);
  const wishlist = allTools.filter((t) => t.on_wishlist);
  const list = tab === "owned" ? owned : wishlist;
  const isSelected = (id: string) => selectedIds.includes(id);

  // Taking a tool off My Tools / the wishlist keeps it in the app; deleting
  // removes it entirely. Either way it is detached from this step first, so the
  // step never points at something that is no longer there.
  const detach = (id: string) => {
    if (selectedIds.includes(id)) onToggle(id);
  };
  const takeOff = async (t: UserTool) => {
    setRemoving(true);
    detach(t.id);
    const ok = await updateTool(t.id, { on_shelf: false, on_wishlist: false, on_favourite: false });
    setRemoving(false);
    setPendingRemove(null);
    if (ok) {
      toast.success(tab === "wishlist" ? "Taken off your wishlist" : "Taken off My Tools");
      onToolsChanged?.();
    }
  };
  const hardDelete = async (t: UserTool) => {
    setRemoving(true);
    detach(t.id);
    const ok = await deleteTool(t);
    setRemoving(false);
    setPendingRemove(null);
    if (ok) onToolsChanged?.();
  };


  const handleUrl = async () => {
    const raw = linkUrl.trim();
    if (!raw) return;
    let normalised = raw;
    if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;
    try { new URL(normalised); } catch {
      toast.error("That doesn't look like a valid web link.");
      return;
    }
    setBusy(true);
    try {
      const context = await buildAiContext();
      const { data, error } = await supabase.functions.invoke("tool-analyse-url", {
        body: { url: normalised, context },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.is_tool === false) {
        toast.error("That page doesn't look like a hair tool. Try a different link.");
        return;
      }
      const rawScore = data?.match_score;
      const matched = data?.category
        ? TOOL_CATEGORIES.find((c) => c.toLowerCase() === String(data.category).toLowerCase())
        : undefined;
      const scrapedName = [data?.name, data?.tool_name, data?.title]
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .find((v) => v.length > 0);
      const created = await addTool({
        name: scrapedName || "New tool",
        brand: data?.brand ? String(data.brand) : undefined,
        category: matched,
        notes: data?.summary ? String(data.summary) : undefined,
        imageUrl:
          (typeof data?.image_url === "string" && data.image_url) ||
          (typeof data?._source_image_url === "string" && data._source_image_url) ||
          null,
        matchScore:
          typeof rawScore === "number" ? Math.max(0, Math.min(100, Math.round(rawScore))) : null,
        aiAnalysis: data as Record<string, unknown>,
        sourceUrl: normalised,
      });
      if (created) {
        onToggle(created.id);
        onToolsChanged?.();
        setLinkUrl("");
        onOpenChange(false);
        toast.success("Tool added to My Tools and this step");
      }
    } catch (e) {
      console.error("tool URL scan failed", e);
      toast.error(e instanceof Error ? e.message : "Couldn't analyse that page");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[20px] max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">Add tools used</SheetTitle>
        </SheetHeader>

        <div className="mt-3 rounded-[12px] border border-border bg-card p-3">
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Add a new tool
            </span>
            <span className="text-[11px] text-primary font-medium">{showAdd ? "Hide" : "Show"}</span>
          </button>

          {showAdd && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="Paste tool link"
                    className="pl-8 h-10 text-sm"
                    disabled={busy}
                  />
                </div>
                <Button
                  onClick={() => void handleUrl()}
                  disabled={busy || !linkUrl.trim()}
                  className="h-10 px-3"
                  size="sm"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Add"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                We'll look the tool up, save it to My Tools and attach it to this step.
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 mt-3 bg-card border border-border rounded-[10px]">
          {(["owned", "wishlist"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "py-2 text-xs rounded-md font-medium transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {t === "owned" ? `My Tools (${owned.length})` : `From Wishlist (${wishlist.length})`}
            </button>
          ))}
        </div>

        <div className="space-y-2 mt-3 pb-6">
          {loading ? (
            <LoadingDot label="Loading…" />
          ) : list.length === 0 ? (
            <EmptyState
              message={tab === "owned" ? "No tools yet" : "No tools on your wishlist"}
              hint="Add one from a link above, or from My Tools."
            />
          ) : (
            list.map((t) => (
              <Row key={t.id} t={t} selected={isSelected(t.id)} onClick={() => onToggle(t.id)} />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ToolPickerSheet;
