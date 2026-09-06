import { useEffect, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import PhoneField from "@/components/PhoneField";
import { formatPhone, phoneError, splitStoredPhone, toE164 } from "@/lib/phone";

/**
 * The Profile → personal details mobile-number row. Uses the SAME PhoneField
 * and the SAME normaliser as registration and onboarding, so a number stored in
 * the old local format ("07700 900123") opens as +44 / 7700900123 and is saved
 * back in international form.
 */
export default function PhoneReviewRow({
  stored,
  autoEdit,
  onSave,
}: {
  stored: string | null | undefined;
  autoEdit?: boolean;
  onSave: (e164: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(!!autoEdit);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const initial = splitStoredPhone(stored);
  const [dial, setDial] = useState(initial.dial);
  const [local, setLocal] = useState(initial.local);

  useEffect(() => {
    if (editing) return;
    const next = splitStoredPhone(stored);
    setDial(next.dial);
    setLocal(next.local);
    setSubmitted(false);
  }, [stored, editing]);

  const problem = phoneError(dial, local);

  const commit = async () => {
    setSubmitted(true);
    const e164 = toE164(dial, local);
    if (!e164) return;
    try {
      setSaving(true);
      await onSave(e164);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-body">
            Mobile number
          </div>
          {!editing && (
            <p
              className={`mt-1.5 text-[15px] font-medium leading-snug break-words ${
                stored ? "" : "text-muted-foreground italic font-normal"
              }`}
            >
              {stored ? formatPhone(stored) : "Not set"}
            </p>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit mobile number"
            className="shrink-0 size-8 rounded-full border border-border hover:border-primary hover:bg-primary/10 text-primary flex items-center justify-center transition-colors"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-3">
          <PhoneField
            dial={dial}
            local={local}
            onDialChange={setDial}
            onLocalChange={setLocal}
            invalid={submitted && !!problem}
            id="profile-phone"
          />
          {submitted && problem && (
            <p className="text-[12px] font-body text-destructive" role="alert">
              {problem}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={commit} disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                const next = splitStoredPhone(stored);
                setDial(next.dial);
                setLocal(next.local);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
