import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, ArrowUp, ArrowDown, Pencil, X } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { smartBack } from "@/lib/smartBack";
import VendorRow from "@/components/blood/VendorRow";
import {
  useAllBloodTestVendors,
  useDeleteBloodTestVendor,
  useSaveBloodTestVendor,
  type BloodTestVendor,
  type VendorDraft,
} from "@/hooks/useBloodTestVendors";

/**
 * Admin CRUD for the blood test vendor registry. Ships with no rows: vendors
 * are added here by hand once commercial agreements are in place, and stay
 * inactive until switched on.
 */

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const listToText = (v: string[]) => v.join(", ");
const textToList = (s: string) =>
  s.split(",").map((x) => x.trim()).filter((x) => x.length > 0);

const blankDraft = (sortOrder: number): VendorDraft => ({
  name: "",
  slug: "",
  logo_url: null,
  short_description: null,
  panel_name: null,
  markers_covered: [],
  price_from: null,
  currency: "GBP",
  url: null,
  affiliate_url: null,
  regions_served: [],
  at_home: false,
  is_active: false,
  sort_order: sortOrder,
});

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1">
    <label className="text-[11px] font-body font-medium text-foreground/80">{label}</label>
    {children}
    {hint && <p className="text-[10px] font-body text-muted-foreground leading-snug">{hint}</p>}
  </div>
);

const VendorEditor = ({
  draft,
  onCancel,
  onSaved,
}: {
  draft: VendorDraft;
  onCancel: () => void;
  onSaved: () => void;
}) => {
  const [form, setForm] = useState<VendorDraft>(draft);
  const [markersText, setMarkersText] = useState(listToText(draft.markers_covered));
  const [regionsText, setRegionsText] = useState(listToText(draft.regions_served));
  const save = useSaveBloodTestVendor();

  const set = (patch: Partial<VendorDraft>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("Give the vendor a name.");
      return;
    }
    try {
      await save.mutateAsync({
        ...form,
        name,
        slug: (form.slug || slugify(name)).trim(),
        markers_covered: textToList(markersText),
        regions_served: textToList(regionsText),
        price_from: form.price_from == null || Number.isNaN(form.price_from) ? null : form.price_from,
      });
      toast.success("Vendor saved.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save vendor");
    }
  };

  return (
    <SurfaceCard className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-display text-[15px] font-semibold">
          {draft.id ? "Edit vendor" : "New vendor"}
        </p>
        <button type="button" onClick={onCancel} aria-label="Cancel">
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>

      <Field label="Name">
        <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Slug" hint="Left blank, this is generated from the name.">
        <Input
          value={form.slug}
          onChange={(e) => set({ slug: slugify(e.target.value) })}
          placeholder={slugify(form.name)}
        />
      </Field>
      <Field label="Panel name" hint='e.g. "Iron and ferritin panel"'>
        <Input
          value={form.panel_name ?? ""}
          onChange={(e) => set({ panel_name: e.target.value || null })}
        />
      </Field>
      <Field label="Short description">
        <Textarea
          rows={3}
          value={form.short_description ?? ""}
          onChange={(e) => set({ short_description: e.target.value || null })}
        />
      </Field>
      <Field
        label="Markers covered"
        hint="Comma separated, and spelled exactly as STRAND stores them — e.g. Ferritin, Serum Iron, Transferrin Saturation, Vitamin D, TSH."
      >
        <Textarea rows={3} value={markersText} onChange={(e) => setMarkersText(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Price from">
          <Input
            inputMode="decimal"
            value={form.price_from == null ? "" : String(form.price_from)}
            onChange={(e) =>
              set({ price_from: e.target.value.trim() === "" ? null : Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Currency">
          <Input
            value={form.currency}
            onChange={(e) => set({ currency: e.target.value.toUpperCase().slice(0, 3) })}
          />
        </Field>
      </div>
      <Field label="Logo URL">
        <Input value={form.logo_url ?? ""} onChange={(e) => set({ logo_url: e.target.value || null })} />
      </Field>
      <Field label="Website URL">
        <Input value={form.url ?? ""} onChange={(e) => set({ url: e.target.value || null })} />
      </Field>
      <Field
        label="Affiliate URL"
        hint="Populated, every surface showing this vendor automatically displays the commission disclosure."
      >
        <Input
          value={form.affiliate_url ?? ""}
          onChange={(e) => set({ affiliate_url: e.target.value || null })}
        />
      </Field>
      <Field label="Regions served" hint="Comma separated, e.g. UK, England, Scotland.">
        <Input value={regionsText} onChange={(e) => setRegionsText(e.target.value)} />
      </Field>

      <div className="flex items-center justify-between rounded-[10px] border border-border/70 px-3 py-2">
        <span className="text-[12px] font-body">Kit posted to the user (at home)</span>
        <Switch checked={form.at_home} onCheckedChange={(v) => set({ at_home: v })} />
      </div>
      <div className="flex items-center justify-between rounded-[10px] border border-border/70 px-3 py-2">
        <span className="text-[12px] font-body">Active — visible to members</span>
        <Switch checked={form.is_active} onCheckedChange={(v) => set({ is_active: v })} />
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={submit} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save vendor"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </SurfaceCard>
  );
};

const AdminBloodVendors = () => {
  const nav = useNavigate();
  const { vendors, loading, refetch } = useAllBloodTestVendors();
  const save = useSaveBloodTestVendor();
  const del = useDeleteBloodTestVendor();
  const [editing, setEditing] = useState<VendorDraft | null>(null);

  const nextSort = useMemo(
    () => (vendors.length ? Math.max(...vendors.map((v) => v.sort_order)) + 1 : 0),
    [vendors],
  );

  const move = async (v: BloodTestVendor, dir: -1 | 1) => {
    const ordered = [...vendors].sort((a, b) => a.sort_order - b.sort_order);
    const i = ordered.findIndex((x) => x.id === v.id);
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    const other = ordered[j];
    try {
      await save.mutateAsync({ ...v, sort_order: other.sort_order });
      await save.mutateAsync({ ...other, sort_order: v.sort_order });
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reorder");
    }
  };

  const toggleActive = async (v: BloodTestVendor) => {
    try {
      await save.mutateAsync({ ...v, is_active: !v.is_active });
      toast.success(v.is_active ? "Vendor hidden from members." : "Vendor is now live.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update vendor");
    }
  };

  const remove = async (v: BloodTestVendor) => {
    try {
      await del.mutateAsync(v.id);
      toast.success("Vendor deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete vendor");
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title="Blood test vendors" onBack={() => smartBack(nav, "/admin")} />
      <div className="px-5 pb-10 space-y-4">
        <p className="text-[11px] font-body text-muted-foreground leading-snug">
          Vendors are managed here only — nothing is hardcoded in the app. A vendor
          stays hidden from members until you switch it to active.
        </p>

        {editing ? (
          <VendorEditor
            draft={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              refetch();
            }}
          />
        ) : (
          <Button className="w-full" onClick={() => setEditing(blankDraft(nextSort))}>
            <Plus className="size-4 mr-1.5" />
            Add a vendor
          </Button>
        )}

        {loading ? (
          <LoadingDot />
        ) : vendors.length === 0 ? (
          <EmptyState
            message="No vendors yet"
            hint="Add a vendor once a commercial agreement is in place."
          />
        ) : (
          <>
            <SectionLabel>Registry</SectionLabel>
            <div className="space-y-3">
              {[...vendors]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((v, i, arr) => (
                  <VendorRow
                    key={v.id}
                    vendor={v}
                    footer={
                      <div className="pt-2 border-t border-border/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-body">
                            {v.is_active ? "Live to members" : "Hidden"}
                          </span>
                          <Switch checked={v.is_active} onCheckedChange={() => toggleActive(v)} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing({ ...v })}
                            className="flex-1"
                          >
                            <Pencil className="size-3.5 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Move ${v.name} up`}
                            disabled={i === 0}
                            onClick={() => move(v, -1)}
                          >
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Move ${v.name} down`}
                            disabled={i === arr.length - 1}
                            onClick={() => move(v, 1)}
                          >
                            <ArrowDown className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Delete ${v.name}`}
                            onClick={() => remove(v)}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    }
                  />
                ))}
            </div>
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminBloodVendors;
