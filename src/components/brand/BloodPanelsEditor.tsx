import { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  useDeleteBloodPanel,
  useMyBloodPanels,
  useSaveBloodPanel,
  type PanelDraft,
} from "@/hooks/useBloodTestBrands";
import {
  BLOOD_MARKER_VOCABULARY,
  BRAND_BLOOD_CLAIM_HINT,
  isHttpsUrl,
} from "@/lib/bloodTestBrands";

/**
 * Brand-owned editor for the at-home blood test claim and its panels.
 *
 * The brand ticks the CLAIM. It can never set the verified flag — that column
 * is admin-only and reverted by a database trigger if a brand tries.
 */

const emptyDraft = (): PanelDraft => ({
  panel_name: "",
  markers_covered: [],
  price_from: null,
  currency: "GBP",
  purchase_url: "",
  affiliate_url: null,
  regions_served: [],
  is_active: true,
  sort_order: 0,
});

const BloodPanelsEditor = ({
  claimed,
  verified,
  onClaimChange,
}: {
  claimed: boolean;
  verified: boolean;
  onClaimChange: (v: boolean) => void;
}) => {
  const { panels, loading } = useMyBloodPanels();
  const savePanel = useSaveBloodPanel();
  const removePanel = useDeleteBloodPanel();
  const [draft, setDraft] = useState<PanelDraft | null>(null);
  const [markerQuery, setMarkerQuery] = useState("");

  const submit = async () => {
    if (!draft) return;
    if (!draft.panel_name.trim()) return toast.error("Give the panel a name");
    if (!isHttpsUrl(draft.purchase_url)) {
      return toast.error("The purchase link must be a secure https:// address");
    }
    if (draft.affiliate_url && !isHttpsUrl(draft.affiliate_url)) {
      return toast.error("The affiliate link must be a secure https:// address");
    }
    if (draft.markers_covered.length === 0) {
      return toast.error("Choose at least one marker this panel covers");
    }
    try {
      await savePanel.mutateAsync({
        ...draft,
        panel_name: draft.panel_name.trim(),
        purchase_url: draft.purchase_url.trim(),
        affiliate_url: draft.affiliate_url?.trim() || null,
      });
      setDraft(null);
      toast.success("Panel saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save panel");
    }
  };

  const matches = markerQuery.trim()
    ? BLOOD_MARKER_VOCABULARY.filter((m) =>
        m.toLowerCase().includes(markerQuery.trim().toLowerCase()),
      ).slice(0, 8)
    : [];

  return (
    <SurfaceCard className="space-y-3">
      <SectionLabel className="!px-0 !mt-0">At-home blood tests</SectionLabel>

      <label className="flex items-start gap-2.5">
        <Checkbox
          checked={claimed}
          onCheckedChange={(v) => onClaimChange(v === true)}
          className="mt-0.5"
        />
        <span className="text-[12.5px] font-body leading-snug">
          We sell an at-home blood testing kit
          <span className="block text-[11px] text-muted-foreground mt-0.5">
            {BRAND_BLOOD_CLAIM_HINT}
          </span>
        </span>
      </label>

      {claimed && (
        <p
          className={
            verified
              ? "text-[11px] font-body text-good"
              : "text-[11px] font-body text-muted-foreground"
          }
        >
          {verified
            ? "Verified by STRAND — your panels can appear to members."
            : "Awaiting STRAND review. Your panels stay hidden from members until then."}
        </p>
      )}

      {claimed && (
        <div className="space-y-2 pt-1">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            panels.map((p) => (
              <div
                key={p.id}
                className="rounded-[12px] border border-border bg-background px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-body font-semibold truncate">{p.panel_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {p.markers_covered.length} marker
                      {p.markers_covered.length === 1 ? "" : "s"}
                      {p.price_from != null ? ` · from £${p.price_from}` : ""}
                      {p.affiliate_url ? " · affiliate link" : ""}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[11px]"
                      onClick={() => setDraft(p)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-destructive"
                      aria-label={`Delete ${p.panel_name}`}
                      onClick={() => p.id && removePanel.mutate(p.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}

          {!draft && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-pill text-[12px]"
              onClick={() => setDraft(emptyDraft())}
            >
              <Plus className="size-3.5 mr-1.5" /> Add a panel
            </Button>
          )}

          {draft && (
            <div className="space-y-3 rounded-[12px] border border-primary/40 bg-background p-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Panel name *
                </Label>
                <Input
                  value={draft.panel_name}
                  placeholder="Iron and ferritin panel"
                  onChange={(e) => setDraft({ ...draft, panel_name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Markers covered *
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {draft.markers_covered.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          markers_covered: draft.markers_covered.filter((x) => x !== m),
                        })
                      }
                      className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-body"
                    >
                      {m} ×
                    </button>
                  ))}
                </div>
                <Input
                  value={markerQuery}
                  placeholder="Search markers — e.g. Ferritin"
                  onChange={(e) => setMarkerQuery(e.target.value)}
                />
                {matches.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {matches.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          if (!draft.markers_covered.includes(m)) {
                            setDraft({ ...draft, markers_covered: [...draft.markers_covered, m] });
                          }
                          setMarkerQuery("");
                        }}
                        className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-body"
                      >
                        + {m}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[10.5px] text-muted-foreground font-body">
                  Pick from STRAND's marker list so we can match your panel to the
                  results a member is missing.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Price from (£)
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.price_from ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        price_from: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Regions served
                  </Label>
                  <Input
                    value={draft.regions_served.join(", ")}
                    placeholder="UK, Ireland"
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        regions_served: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Purchase link *
                </Label>
                <Input
                  type="url"
                  value={draft.purchase_url}
                  placeholder="https://"
                  onChange={(e) => setDraft({ ...draft, purchase_url: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Affiliate link (optional)
                </Label>
                <Input
                  type="url"
                  value={draft.affiliate_url ?? ""}
                  placeholder="https://"
                  onChange={(e) => setDraft({ ...draft, affiliate_url: e.target.value || null })}
                />
                <p className="text-[10.5px] text-muted-foreground font-body">
                  If you add one, members see a commission disclosure next to the buy
                  button automatically.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-9 rounded-pill text-[12px] flex-1"
                  disabled={savePanel.isPending}
                  onClick={submit}
                >
                  {savePanel.isPending ? "Saving…" : "Save panel"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 rounded-pill text-[12px]"
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </SurfaceCard>
  );
};

export default BloodPanelsEditor;
