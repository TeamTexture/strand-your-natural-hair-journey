import { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SectionLabel from "@/components/SectionLabel";
import { toast } from "sonner";
import {
  STYLIST_CONSENT_LABEL,
  STYLIST_EMAIL_HELP,
  STYLIST_EMAIL_LABEL,
} from "@/lib/salonCopy";
import {
  emptyStylistDraft,
  type Discipline,
  type StylistDraft,
} from "@/hooks/useSalon";

const DISCIPLINES: Discipline[] = [
  "Trichologist",
  "Dermatologist",
  "Curl Specialist",
  "Colourist",
  "Stylist",
];

const Field = ({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-body uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </Label>
    {children}
    {help && (
      <p className="text-[11px] font-body text-muted-foreground leading-relaxed">
        {help}
      </p>
    )}
  </div>
);

const StylistEditorSheet = ({
  open,
  onOpenChange,
  initial,
  mode,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: StylistDraft;
  mode: "add" | "edit";
  saving?: boolean;
  onSave: (draft: StylistDraft) => void;
}) => {
  const [draft, setDraft] = useState<StylistDraft>(initial ?? emptyStylistDraft());
  const [specInput, setSpecInput] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initial ?? emptyStylistDraft());
      setSpecInput("");
      setConsent(mode === "edit");
    }
  }, [open, initial, mode]);

  const patch = (p: Partial<StylistDraft>) => setDraft((d) => ({ ...d, ...p }));

  const addSpec = () => {
    const v = specInput.trim();
    if (!v || draft.specialisms.includes(v)) return setSpecInput("");
    patch({ specialisms: [...draft.specialisms, v] });
    setSpecInput("");
  };

  const submit = () => {
    if (draft.display_name.trim().length < 2) {
      toast.error("Enter the stylist's name.");
      return;
    }
    if (
      draft.contact_email.trim() &&
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.contact_email.trim())
    ) {
      toast.error("Enter a valid enquiry email, or leave it blank.");
      return;
    }
    if (draft.discount_active && !draft.discount_code.trim()) {
      toast.error("Add a discount code, or switch the discount off.");
      return;
    }
    if (!consent) {
      toast.error("Please confirm the stylist has agreed to be listed.");
      return;
    }
    onSave(draft);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">
            {mode === "add" ? "Add a stylist" : "Edit stylist"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 pt-3 pb-6">
          <section className="space-y-3">
            <SectionLabel>Stylist</SectionLabel>
            <Field label="Full name *">
              <Input
                value={draft.display_name}
                onChange={(e) => patch({ display_name: e.target.value })}
                placeholder="Amara Okonkwo"
                maxLength={120}
              />
            </Field>
            <Field label="Discipline *">
              <Select
                value={draft.discipline}
                onValueChange={(v) => patch({ discipline: v as Discipline })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={STYLIST_EMAIL_LABEL} help={STYLIST_EMAIL_HELP}>
              <Input
                type="email"
                value={draft.contact_email}
                onChange={(e) => patch({ contact_email: e.target.value })}
                placeholder="amara@yoursalon.co.uk"
                maxLength={255}
              />
            </Field>
            <Field label="Short bio">
              <Textarea
                rows={3}
                value={draft.bio}
                onChange={(e) => patch({ bio: e.target.value })}
                maxLength={800}
              />
            </Field>
          </section>

          <section className="space-y-2">
            <SectionLabel>Specialisms</SectionLabel>
            <div className="flex gap-2">
              <Input
                value={specInput}
                onChange={(e) => setSpecInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSpec();
                  }
                }}
                placeholder="e.g. Cornrows"
              />
              <Button variant="outline" size="sm" onClick={addSpec}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {draft.specialisms.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-body"
                >
                  {s}
                  <button
                    onClick={() =>
                      patch({
                        specialisms: draft.specialisms.filter((x) => x !== s),
                      })
                    }
                    aria-label={`Remove ${s}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <SectionLabel>Services</SectionLabel>
            <p className="text-[11px] font-body text-muted-foreground leading-relaxed">
              Each stylist has her own services — they aren't shared across the salon.
            </p>
            {draft.services.map((s, i) => (
              <div
                key={i}
                className="rounded-[12px] border border-border bg-card p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={s.name}
                    placeholder="Service name"
                    onChange={(e) => {
                      const list = [...draft.services];
                      list[i] = { ...list[i], name: e.target.value };
                      patch({ services: list });
                    }}
                  />
                  <button
                    onClick={() =>
                      patch({ services: draft.services.filter((_, x) => x !== i) })
                    }
                    aria-label="Remove service"
                    className="text-muted-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={s.price ?? ""}
                    placeholder="Price"
                    onChange={(e) => {
                      const list = [...draft.services];
                      list[i] = { ...list[i], price: e.target.value };
                      patch({ services: list });
                    }}
                  />
                  <Input
                    value={s.duration ?? ""}
                    placeholder="Duration"
                    onChange={(e) => {
                      const list = [...draft.services];
                      list[i] = { ...list[i], duration: e.target.value };
                      patch({ services: list });
                    }}
                  />
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patch({ services: [...draft.services, { name: "" }] })
              }
            >
              <Plus className="size-3.5 mr-1" /> Add service
            </Button>
          </section>

          <section className="space-y-3">
            <SectionLabel>Listing discount</SectionLabel>
            <p className="text-[11px] font-body text-muted-foreground leading-relaxed">
              This discount belongs to this stylist only.
            </p>
            <Field label="Discount code">
              <Input
                value={draft.discount_code}
                onChange={(e) => patch({ discount_code: e.target.value })}
                placeholder="AMARA10"
                maxLength={40}
              />
            </Field>
            <Field label="Discount description">
              <Input
                value={draft.discount_description}
                onChange={(e) => patch({ discount_description: e.target.value })}
                placeholder="10% off a first appointment"
                maxLength={160}
              />
            </Field>
            <label className="flex items-center justify-between gap-3 text-sm font-body">
              <span>Discount active</span>
              <Switch
                checked={draft.discount_active}
                onCheckedChange={(v) => patch({ discount_active: v })}
              />
            </label>
          </section>

          <label className="flex items-start gap-2.5 rounded-[12px] border border-border bg-card p-3">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5"
            />
            <span className="text-[12px] font-body leading-snug text-foreground/85">
              {STYLIST_CONSENT_LABEL}
            </span>
          </label>

          <Button
            variant="gold"
            size="pill"
            className="w-full"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Saving…" : mode === "add" ? "Add stylist" : "Save changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default StylistEditorSheet;
