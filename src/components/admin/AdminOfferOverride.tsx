import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ChevronDown } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import TargetingPicker from "@/components/brand/TargetingPicker";
import { useOfferTargeting } from "@/hooks/useAdTargeting";
import { cleanRules, type TargetingRules } from "@/lib/adTargeting";
import { SLOT_LABEL, type PlacementSlot } from "@/hooks/useBrandOffers";

const SLOTS = Object.keys(SLOT_LABEL) as PlacementSlot[];

interface Props {
  offerId: string;
  startsOn: string | null;
  endsOn: string | null;
  currentSlots: PlacementSlot[];
}

/** Admin-only, fee-free edit of a live (or any-stage) advert. Placement days the
 *  admin adds are recorded at £0 and the advert's price is never increased — the
 *  brand is not asked to pay for a change STRAND made. */
const AdminOfferOverride = ({ offerId, startsOn, endsOn, currentSlots }: Props) => {
  const qc = useQueryClient();
  const { data: liveTargeting } = useOfferTargeting(offerId);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<TargetingRules | null>(null);
  const [slots, setSlots] = useState<PlacementSlot[] | null>(null);
  const [start, setStart] = useState(startsOn ?? "");
  const [end, setEnd] = useState(endsOn ?? "");

  const effectiveRules = rules ?? liveTargeting ?? {};
  const effectiveSlots = slots ?? currentSlots;

  const targetingDirty = useMemo(
    () => rules !== null &&
      JSON.stringify(cleanRules(rules)) !== JSON.stringify(cleanRules(liveTargeting ?? {})),
    [rules, liveTargeting],
  );
  const placementDirty =
    (slots !== null && JSON.stringify([...effectiveSlots].sort()) !== JSON.stringify([...currentSlots].sort())) ||
    start !== (startsOn ?? "") ||
    end !== (endsOn ?? "");

  const toggleSlot = (slot: PlacementSlot) => {
    const next = effectiveSlots.includes(slot)
      ? effectiveSlots.filter((s) => s !== slot)
      : [...effectiveSlots, slot];
    setSlots(next);
  };

  const save = async () => {
    if (!targetingDirty && !placementDirty) {
      toast.info("Nothing changed yet");
      return;
    }
    if (placementDirty && effectiveSlots.length === 0) {
      toast.error("Pick at least one placement");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_override_brand_offer" as never, {
        _offer_id: offerId,
        _targeting: targetingDirty ? cleanRules(effectiveRules) : null,
        _slots: placementDirty ? effectiveSlots : null,
        _starts_on: placementDirty ? start || null : null,
        _ends_on: placementDirty ? end || null : null,
      } as never);
      if (error) throw error;

      toast.success("Advert updated — no fee charged");
      setRules(null);
      setSlots(null);
      for (const key of [
        ["brand-offer", offerId],
        ["offer-targeting", offerId],
        ["admin", "brand-offers"],
        ["active-brand-offer"],
        ["all-live-brand-offers"],
        ["brand-placements-taken"],
        ["admin", "unified-calendar"],
        ["admin", "brand-calendar"],
      ]) {
        qc.invalidateQueries({ queryKey: key as string[] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the advert");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SurfaceCard className="space-y-3 border-primary/30 bg-primary/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-2.5 text-left"
        aria-expanded={open}
      >
        <div className="size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <ShieldCheck className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[14.5px] leading-tight">Edit this advert free (admin)</p>
          <p className="text-[11.5px] text-foreground/80 font-body leading-snug mt-1">
            Change the audience, the placements or the dates on a live advert. No fee,
            no brand payment, no revision review. Days you add are recorded at £0.
          </p>
        </div>
        <ChevronDown className={`size-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-body">Placements</p>
            <div className="flex flex-wrap gap-1.5">
              {SLOTS.map((slot) => {
                const on = effectiveSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleSlot(slot)}
                    className={`min-h-[34px] rounded-full px-3 text-[11.5px] font-body border ${
                      on ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground/80"
                    }`}
                  >
                    {SLOT_LABEL[slot]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-body">Start date</span>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-body">End date</span>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-body">Audience</p>
            <TargetingPicker value={effectiveRules} onChange={(next) => setRules(next)} />
          </div>

          <Button variant="gold" size="pill" onClick={save} disabled={saving} className="w-full">
            {saving ? "Saving…" : "Apply changes — no fee"}
          </Button>
          <p className="text-[10.5px] text-muted-foreground font-body leading-snug">
            Days already served stay on the record. Every override is logged against your
            admin account.
          </p>
        </div>
      )}
    </SurfaceCard>
  );
};

export default AdminOfferOverride;
