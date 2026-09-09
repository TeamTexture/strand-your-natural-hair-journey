// "Tools used" — up to three tools from her own shelf of tools.
//
// Follows the same multi-add pattern as "Stylers used": filled rows first, one
// "Add a tool" row while there is room left, remove with the X.
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import ProductThumb from "@/components/ProductThumb";
import ToolPickerSheet from "@/components/ToolPickerSheet";
import { useUserTools } from "@/hooks/useUserTools";
import { MAX_WASH_TOOLS } from "@/lib/washLogSteps";

interface Props {
  toolIds: string[];
  onChange: (ids: string[]) => void;
  /** Copy under the heading. */
  description?: string;
}

const WashToolsSection = ({ toolIds, onChange, description }: Props) => {
  const { tools, load } = useUserTools();
  const [pickerOpen, setPickerOpen] = useState(false);

  const byId = useMemo(() => {
    const map: Record<string, (typeof tools)[number]> = {};
    for (const t of tools) map[t.id] = t;
    return map;
  }, [tools]);

  const toggle = (id: string) => {
    if (toolIds.includes(id)) {
      onChange(toolIds.filter((t) => t !== id));
      return;
    }
    if (toolIds.length >= MAX_WASH_TOOLS) return;
    onChange([...toolIds, id]);
  };

  return (
    <div className="space-y-2.5">
      <p className="pt-1 text-[10.5px] uppercase tracking-[0.18em] text-foreground/60 font-medium">
        Tools used
      </p>
      {description && (
        <p className="font-body text-[12px] text-muted-foreground">{description}</p>
      )}

      {toolIds.map((id) => {
        const tool = byId[id];
        return (
          <div key={id} className="rounded-[14px] border border-border bg-card p-3">
            <div className="flex items-center gap-3">
              <ProductThumb
                imageUrl={tool?.image_url ?? null}
                storagePath={tool?.storage_path ?? null}
                alt={tool?.name ?? "Tool"}
                cover
                wrapperClassName="size-[34px] rounded-[7px] overflow-hidden bg-secondary shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] text-primary font-medium">
                  {tool?.category ?? "Tool"}
                </p>
                <p className="product-title text-[13px] leading-snug break-words [overflow-wrap:anywhere]">
                  {tool?.name ?? "Tool"}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${tool?.name ?? "tool"}`}
                onClick={() => onChange(toolIds.filter((t) => t !== id))}
                className="shrink-0 size-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/60"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        );
      })}

      {toolIds.length < MAX_WASH_TOOLS && (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full rounded-[14px] border border-dashed border-border bg-card p-3 flex items-center gap-3 text-left"
        >
          <span className="size-[34px] rounded-[7px] border border-dashed border-border flex items-center justify-center shrink-0">
            <Plus className="size-3.5 text-muted-foreground" aria-hidden />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase tracking-[0.16em] text-primary font-medium">
              Add a tool
            </span>
            <span className="block font-body text-[12.5px] text-muted-foreground">
              Up to {MAX_WASH_TOOLS} — {MAX_WASH_TOOLS - toolIds.length} left
            </span>
          </span>
        </button>
      )}

      <ToolPickerSheet
        open={pickerOpen}
        onOpenChange={(o) => {
          if (!o) setPickerOpen(false);
        }}
        selectedIds={toolIds}
        onToggle={(id) => {
          toggle(id);
          setPickerOpen(false);
        }}
        onToolsChanged={() => void load()}
      />
    </div>
  );
};

export default WashToolsSection;
