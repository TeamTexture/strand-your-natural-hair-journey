import { useState, useEffect } from "react";
import { Check, Pencil, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Tag from "@/components/Tag";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

/**
 * ReviewField — the shared "see what's saved, tap to edit just this,
 * save, and stay put" primitive for all profile-review pages.
 *
 * Two rendering modes:
 *   - view: shows the current value(s) as read-only text/chips + pencil.
 *   - edit: shows an inline editor (text / number / select / chips) with
 *          Save + Cancel. Save calls the onSave prop with the local draft.
 */

export type ReviewFieldKind =
  | { type: "text"; placeholder?: string; maxLength?: number; uppercase?: boolean }
  | { type: "number"; min?: number; max?: number; placeholder?: string }
  | { type: "select"; options: string[] }
  | { type: "chip-single"; options: string[] }
  | { type: "chip-multi"; options: string[] };

interface Props {
  label: string;
  value: string | string[] | number | null | undefined;
  /** Optional secondary line rendered under the value in view mode. */
  hint?: string;
  /** Read-only means no pencil, no editor. */
  readOnly?: boolean;
  /** When present, view-mode pencil dispatches to this handler instead of
   *  entering inline edit — used for fields that need a dedicated screen
   *  (e.g. medications, avatar). */
  onOpenExternal?: () => void;
  kind?: ReviewFieldKind;
  onSave?: (next: string | string[] | number) => Promise<void> | void;
  /** Force the field into edit mode on mount (used by ?edit=<key> deep links). */
  autoEdit?: boolean;
}

const formatValue = (
  value: Props["value"],
): { text: string; chips: string[] | null } => {
  if (value == null || value === "") return { text: "Not set", chips: null };
  if (Array.isArray(value)) {
    if (value.length === 0) return { text: "Not set", chips: null };
    return { text: value.join(", "), chips: value };
  }
  return { text: String(value), chips: null };
};

const ReviewField = ({
  label,
  value,
  hint,
  readOnly,
  onOpenExternal,
  kind,
  onSave,
  autoEdit,
}: Props) => {
  const [editing, setEditing] = useState(!!autoEdit);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<string | string[] | number>(
    Array.isArray(value) ? [...value] : (value ?? ""),
  );

  useEffect(() => {
    if (!editing) {
      setDraft(Array.isArray(value) ? [...value] : (value ?? ""));
    }
  }, [value, editing]);

  const startEdit = () => {
    if (readOnly) return;
    if (onOpenExternal) {
      onOpenExternal();
      return;
    }
    setDraft(Array.isArray(value) ? [...value] : (value ?? ""));
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(Array.isArray(value) ? [...value] : (value ?? ""));
  };

  const commit = async () => {
    if (!onSave) return setEditing(false);
    let toSave: string | string[] | number = draft;
    if (kind?.type === "text") {
      const t = String(draft).trim();
      toSave = kind.uppercase ? t.toUpperCase() : t;
    }
    if (kind?.type === "number") {
      const n = Number(draft);
      if (!Number.isFinite(n)) return;
      toSave = n;
    }
    try {
      setSaving(true);
      await onSave(toSave);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const { text, chips } = formatValue(value);

  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
            {label}
          </div>
          {!editing && (
            <>
              {chips ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[13px] font-medium"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p
                  className={cn(
                    "mt-1.5 text-[15px] font-medium leading-snug break-words",
                    text === "Not set" && "text-muted-foreground italic font-normal",
                  )}
                >
                  {text}
                </p>
              )}
              {hint && (
                <p className="mt-1 text-[12px] text-muted-foreground leading-snug">
                  {hint}
                </p>
              )}
            </>
          )}
        </div>
        {!editing && !readOnly && (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`Edit ${label}`}
            className="shrink-0 size-8 rounded-full border border-border hover:border-primary hover:bg-primary/10 text-primary flex items-center justify-center transition-colors"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>

      {editing && kind && (
        <div className="mt-3 space-y-3">
          {kind.type === "text" && (
            <Input
              value={String(draft ?? "")}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={kind.placeholder}
              maxLength={kind.maxLength}
              autoFocus
            />
          )}
          {kind.type === "number" && (
            <Input
              type="number"
              min={kind.min}
              max={kind.max}
              value={String(draft ?? "")}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={kind.placeholder}
              autoFocus
            />
          )}
          {kind.type === "select" && (
            <Select
              value={String(draft ?? "")}
              onValueChange={(v) => setDraft(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {kind.options.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {kind.type === "chip-single" && (
            <div className="flex flex-wrap gap-2">
              {kind.options.map((o) => (
                <Tag
                  key={o}
                  selected={draft === o}
                  onClick={() => setDraft(o)}
                >
                  {o}
                </Tag>
              ))}
            </div>
          )}
          {kind.type === "chip-multi" && (
            <div className="flex flex-wrap gap-2">
              {kind.options.map((o) => {
                const arr = Array.isArray(draft) ? draft : [];
                const on = arr.includes(o);
                return (
                  <Tag
                    key={o}
                    selected={on}
                    onClick={() =>
                      setDraft(on ? arr.filter((v) => v !== o) : [...arr, o])
                    }
                  >
                    {o}
                  </Tag>
                );
              })}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="gold"
              size="pill"
              className="!min-h-[38px] !text-[12px] !px-4"
              onClick={commit}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Save
            </Button>
            <Button
              type="button"
              variant="goldOutline"
              size="pill"
              className="!min-h-[38px] !text-[12px] !px-4"
              onClick={cancel}
              disabled={saving}
            >
              <X className="size-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewField;
