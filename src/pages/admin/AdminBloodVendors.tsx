import { useState } from "react";
import { Plus, Loader2, Trash2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  emptyVendorDraft,
  useCuratedBloodVendors,
  useDeleteBloodPanel,
  useSaveCuratedBloodVendor,
  type VendorDraft,
} from "@/hooks/useBloodTestBrands";
import { BLOOD_MARKER_VOCABULARY, isHttpsUrl } from "@/lib/bloodTestBrands";

/**
 * Curated at-home blood test vendors — third parties with no STRAND login.
 * Admin-only. Nothing here is invented: a vendor stays inactive until a human
 * fills in the panel, price, markers and link from the vendor's own material.
 */

const AdminBloodVendors = () => {
  const { vendors, loading } = useCuratedBloodVendors();
  const save = useSaveCuratedBloodVendor();
  const remove = useDeleteBloodPanel();
  const [draft, setDraft] = useState<VendorDraft | null>(null);
  const [markerQuery, setMarkerQuery] = useState("");

  const set = <K extends keyof VendorDraft>(k: K, v: VendorDraft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const submit = async () => {
    if (!draft) return;
    if (!draft.vendor_name.trim()) return toast.error("Give the vendor a name");
    for (const [label, url] of [
      ["website", draft.vendor_website],
      ["purchase link", draft.purchase_url],
      ["affiliate link", draft.affiliate_url],
    ] as const) {
      if (url?.trim() && !isHttpsUrl(url)) {
        return toast.error(`The ${label} must be a secure https:// address`);
      }
    }
    if (draft.is_active && !draft.purchase_url?.trim() && !draft.affiliate_url?.trim()) {
      return toast.error("Add a purchase or affiliate link before going live");
    }
    try {
      await save.mutateAsync({
        ...draft,
        vendor_name: draft.vendor_name.trim(),
        vendor_website: draft.vendor_website?.trim() || null,
        panel_name: draft.panel_name?.trim() || null,
        purchase_url: draft.purchase_url?.trim() || null,
        affiliate_url: draft.affiliate_url?.trim() || null,
        discount_code: draft.discount_code?.trim() || null,
        discount_details: draft.discount_details?.trim() || null,
      });
      setDraft(null);
      toast.success("Vendor saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save vendor");
    }
  };

  const markerMatches = markerQuery.trim()
    ? BLOOD_MARKER_VOCABULARY.filter(
        (m) =>
          m.toLowerCase().includes(markerQuery.trim().toLowerCase()) &&
          !(draft?.markers_covered ?? []).includes(m),
      ).slice(0, 8)
    : [];

  return (
    <ScreenLayout>
      <TitleBar title="Blood test vendors" />

      <div className="px-5 space-y-4 pb-10">
        <p className="text-[12px] font-body text-muted-foreground leading-relaxed">
          At-home kit providers that don't have a STRAND brand account. Only active
          vendors appear to members, so leave a vendor inactive until the panel,
          markers, price and link are confirmed from the vendor's own material.
        </p>

        {loading ? (
          <div className="py-10">
            <LoadingDot />
          </div>
        ) : (
          <>
            {vendors.length === 0 && (
              <SurfaceCard>
                <p className="text-[12.5px] font-body text-muted-foreground">No vendors yet.</p>
              </SurfaceCard>
            )}

            {vendors.map((v) => (
              <SurfaceCard key={v.id} className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[15px] font-semibold leading-tight">
                      {v.vendor_name}
                    </p>
                    <p className="text-[11.5px] font-body text-foreground/75">
                      {v.panel_name?.trim() || "No panel details yet"}
                    </p>
                  </div>
                  <span
                    className={
                      v.is_active
                        ? "rounded-full bg-good/15 px-2 py-0.5 text-[10px] font-body text-good"
                        : "rounded-full bg-secondary px-2 py-0.5 text-[10px] font-body text-foreground/70"
                    }
                  >
                    {v.is_active ? "Live" : "Hidden"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {v.is_at_home_kit && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-body">
                      <FlaskConical className="size-3" aria-hidden="true" /> At-home kit
                    </span>
                  )}
                  {(v.markers_covered ?? []).length > 0 && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-body">
                      {v.markers_covered.length} markers
                    </span>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-pill text-[12px]"
                    onClick={() => setDraft({ ...emptyVendorDraft(), ...v })}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-pill text-[12px] text-destructive"
                    onClick={() => v.id && remove.mutate(v.id)}
                  >
                    <Trash2 className="size-3.5" /> Remove
                  </Button>
                </div>
              </SurfaceCard>
            ))}

            {!draft && (
              <Button
                variant="outline"
                className="w-full rounded-pill"
                onClick={() => setDraft(emptyVendorDraft())}
              >
                <Plus className="size-4" /> Add a vendor
              </Button>
            )}
          </>
        )}

        {draft && (
          <SurfaceCard className="space-y-3">
            <SectionLabel className="!px-0 !mt-0">
              {draft.id ? "Edit vendor" : "New vendor"}
            </SectionLabel>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Vendor name</Label>
              <Input
                value={draft.vendor_name}
                onChange={(e) => set("vendor_name", e.target.value)}
                placeholder="e.g. Lola Health"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Vendor website (https)</Label>
              <Input
                value={draft.vendor_website ?? ""}
                onChange={(e) => set("vendor_website", e.target.value)}
                placeholder="https://"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Panel name</Label>
              <Input
                value={draft.panel_name ?? ""}
                onChange={(e) => set("panel_name", e.target.value)}
                placeholder="As named by the vendor"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Price from</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={draft.price_from ?? ""}
                  onChange={(e) =>
                    set("price_from", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">Currency</Label>
                <Input
                  value={draft.currency}
                  onChange={(e) => set("currency", e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Purchase link (https)</Label>
              <Input
                value={draft.purchase_url ?? ""}
                onChange={(e) => set("purchase_url", e.target.value)}
                placeholder="https://"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Affiliate link (https, optional)</Label>
              <Input
                value={draft.affiliate_url ?? ""}
                onChange={(e) => set("affiliate_url", e.target.value)}
                placeholder="https://"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[12px]">Discount code</Label>
                <Input
                  value={draft.discount_code ?? ""}
                  onChange={(e) => set("discount_code", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">Sort order</Label>
                <Input
                  type="number"
                  value={draft.sort_order}
                  onChange={(e) => set("sort_order", Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Discount details</Label>
              <Textarea
                rows={2}
                value={draft.discount_details ?? ""}
                onChange={(e) => set("discount_details", e.target.value)}
                placeholder="e.g. 10% off your first order"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Markers covered</Label>
              <div className="flex flex-wrap gap-1.5">
                {draft.markers_covered.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() =>
                      set(
                        "markers_covered",
                        draft.markers_covered.filter((x) => x !== m),
                      )
                    }
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-body"
                  >
                    {m} ×
                  </button>
                ))}
              </div>
              <Input
                value={markerQuery}
                onChange={(e) => setMarkerQuery(e.target.value)}
                placeholder="Search markers"
              />
              {markerMatches.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {markerMatches.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        set("markers_covered", [...draft.markers_covered, m]);
                        setMarkerQuery("");
                      }}
                      className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-body"
                    >
                      + {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Regions served</Label>
              <Input
                value={draft.regions_served.join(", ")}
                onChange={(e) =>
                  set(
                    "regions_served",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="e.g. UK"
              />
            </div>

            <label className="flex items-start gap-2.5">
              <Checkbox
                checked={draft.is_at_home_kit}
                onCheckedChange={(v) => set("is_at_home_kit", v === true)}
                className="mt-0.5"
              />
              <span className="text-[12.5px] font-body leading-snug">
                Offers at-home blood kits
              </span>
            </label>

            <label className="flex items-start gap-2.5">
              <Checkbox
                checked={draft.is_active}
                onCheckedChange={(v) => set("is_active", v === true)}
                className="mt-0.5"
              />
              <span className="text-[12.5px] font-body leading-snug">
                Live — visible to members
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  Only tick this once the panel, price, markers and link are confirmed.
                </span>
              </span>
            </label>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1 rounded-pill" onClick={submit} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save vendor"}
              </Button>
              <Button variant="ghost" className="rounded-pill" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </SurfaceCard>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminBloodVendors;
