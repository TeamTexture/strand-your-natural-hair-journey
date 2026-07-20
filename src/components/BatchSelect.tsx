import { useState, useCallback, useMemo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared primitives for multi-select on product list pages
 * (Shelf, Wishlist, Off Shelf, Favourites).
 *
 * Each page owns the selectMode toggle and the set of selected ids; this
 * module exposes a hook that manages that state plus a small set of
 * presentational bits (the checkbox circle and the bottom action bar) so
 * every page behaves identically.
 */

export function useBatchSelection() {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const clear = useCallback(() => setSelected(new Set()), []);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enter = useCallback((id?: string) => {
    setSelectMode(true);
    if (id) setSelected(new Set([id]));
  }, []);

  const exit = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelected(new Set(ids));
  }, []);

  const ids = useMemo(() => Array.from(selected), [selected]);

  return {
    selectMode,
    setSelectMode,
    selected,
    ids,
    count: selected.size,
    toggle,
    enter,
    exit,
    clear,
    selectAll,
  };
}

/** Small circular checkbox rendered inside a product row while in select mode. */
export function SelectCheckbox({
  checked,
  className,
}: {
  checked: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
        checked
          ? "bg-primary border-primary text-primary-foreground"
          : "bg-background border-border",
        className,
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}

/** Toggle button that lives in the TitleBar right slot. */
export function SelectToggleButton({
  selectMode,
  onEnter,
  onExit,
  disabled,
}: {
  selectMode: boolean;
  onEnter: () => void;
  onExit: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={selectMode ? onExit : onEnter}
      disabled={disabled}
      className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium px-2 min-h-[44px] disabled:opacity-40"
    >
      {selectMode ? "Done" : "Select"}
    </button>
  );
}

export interface BatchAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * Fixed bottom bar that appears above the tab bar while in select mode.
 * Accepts a variable list of actions so each page can express its own
 * verbs (Take off shelf / Move to shelf / Add to favourites / Delete…).
 */
export function BatchActionBar({
  count,
  totalVisible,
  onSelectAll,
  onClear,
  actions,
}: {
  count: number;
  totalVisible: number;
  onSelectAll: () => void;
  onClear: () => void;
  actions: BatchAction[];
}) {
  const allSelected = count > 0 && count >= totalVisible;
  return (
    <div className="fixed inset-x-0 bottom-[72px] z-40 pointer-events-none px-3">
      <div className="mx-auto max-w-[375px] pointer-events-auto rounded-2xl border border-border bg-card/95 backdrop-blur shadow-lg">
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <p className="text-[11px] font-medium text-foreground">
            {count} selected
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={allSelected ? onClear : onSelectAll}
              className="text-[10px] uppercase tracking-[0.15em] text-primary font-medium"
            >
              {allSelected ? "Clear" : "Select all"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 px-2 pb-2">
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={a.onClick}
              disabled={a.disabled || count === 0}
              className={cn(
                "flex-1 min-w-[70px] rounded-xl px-2 py-2 text-[11px] font-medium leading-tight flex flex-col items-center gap-0.5 border transition-colors",
                a.destructive
                  ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                  : "border-border text-foreground hover:bg-primary/10",
                "disabled:opacity-40 disabled:pointer-events-none",
              )}
            >
              {a.icon}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
