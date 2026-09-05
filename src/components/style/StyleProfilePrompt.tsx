import { useEffect, useState } from "react";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import StylePicker, { type StyleAttributesValue } from "@/components/style/StylePicker";
import {
  styleAsksTension,
  styleCanTakeExtensions,
  HAIRSTYLE_OPTIONS,
} from "@/lib/hairstyles";
import { supabase } from "@/integrations/supabase/client";
import { announceStyleChange } from "@/lib/styleChange";
import { useQueryClient } from "@tanstack/react-query";
import {
  clearPendingStylePrompt,
  dismissStylePrompt,
  readPendingStylePrompt,
  type PendingStylePrompt,
} from "@/lib/styleProfilePrompt";
import { getDisplayedAuthUser } from "@/lib/displayedUser";

interface ProfileBefore {
  current_hairstyle: string | null;
  planned_next_style: string | null;
  planned_style_tension: string | null;
  planned_style_extensions: boolean | null;
}

/**
 * Optional prompt shown on the wash day page after a wash day is logged.
 * Offers to bring `user_style_profile` back in line with what the member
 * actually ended up wearing. Nothing is written unless they save.
 */
const StyleProfilePrompt = () => {
  const [pending, setPending] = useState<PendingStylePrompt | null>(null);
  const [before, setBefore] = useState<ProfileBefore | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const qc = useQueryClient();
  const [current, setCurrent] = useState<string>("");
  const [currentAttrs, setCurrentAttrs] = useState<StyleAttributesValue>({
    tension: null,
    extensions: null,
  });
  const [planned, setPlanned] = useState<string>("");
  const [plannedAttrs, setPlannedAttrs] = useState<StyleAttributesValue>({
    tension: null,
    extensions: null,
  });

  useEffect(() => {
    let cancelled = false;
    const p = readPendingStylePrompt();
    if (!p) return;
    void (async () => {
      const { data: u } = await getDisplayedAuthUser();
      if (!u?.user) return;
      const { data } = await supabase
        .from("user_style_profile")
        .select(
          "current_hairstyle, planned_next_style, planned_style_tension, planned_style_extensions",
        )
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (cancelled) return;
      const row = (data ?? null) as ProfileBefore | null;
      setBefore(
        row ?? {
          current_hairstyle: null,
          planned_next_style: null,
          planned_style_tension: null,
          planned_style_extensions: null,
        },
      );
      // Current style prefills from what was just logged.
      const prefill = p.styleAfter && HAIRSTYLE_OPTIONS.includes(p.styleAfter)
        ? p.styleAfter
        : p.styleAfter ?? "";
      setCurrent(prefill);
      setCurrentAttrs({ tension: p.styleTension, extensions: p.styleExtensions });
      // Planned next style shows the existing value only — no new prefill.
      setPlanned(row?.planned_next_style ?? "");
      setPlannedAttrs({
        tension: row?.planned_style_tension ?? null,
        extensions: row?.planned_style_extensions ?? null,
      });
      setPending(p);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pending || !before) return null;

  const reminder = (() => {
    const cur = before.current_hairstyle;
    const plan = before.planned_next_style;
    if (cur && plan)
      return (
        <>
          Right now your profile says you're wearing <strong>{cur}</strong>, and you
          planned <strong>{plan}</strong> next.
        </>
      );
    if (cur)
      return (
        <>
          Right now your profile says you're wearing <strong>{cur}</strong>, with no
          next style planned.
        </>
      );
    if (plan)
      return (
        <>
          Your profile has no current style saved, and you planned{" "}
          <strong>{plan}</strong> next.
        </>
      );
    return <>Your profile has no current or planned style saved yet.</>;
  })();

  const notNow = () => {
    dismissStylePrompt(pending.washDayId);
    setPending(null);
  };

  const save = async () => {
    if (!current) {
      toast.error("Pick your current style");
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await getDisplayedAuthUser();
      if (!u?.user) throw new Error("Not signed in");
      const { error } = await supabase.from("user_style_profile").upsert(
        {
          user_id: u.user.id,
          current_hairstyle: current,
          current_style_tension: styleAsksTension(current) ? currentAttrs.tension : null,
          current_style_extensions: styleCanTakeExtensions(current)
            ? currentAttrs.extensions
            : null,
          planned_next_style: planned || null,
          planned_style_tension: styleAsksTension(planned) ? plannedAttrs.tension : null,
          planned_style_extensions: styleCanTakeExtensions(planned)
            ? plannedAttrs.extensions
            : null,
          style_set_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;

      announceStyleChange(qc);
      clearPendingStylePrompt();
      dismissStylePrompt(pending.washDayId);
      setPending(null);
      toast.success("Style profile updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update your style profile");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <SurfaceCard className="space-y-3">
        <div>
          <p className="font-display text-[17px] leading-snug">
            Would you like to update your current style profile?
          </p>
          <p className="text-[12px] text-muted-foreground font-body mt-1.5 leading-relaxed">
            {reminder}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="pill" variant="gold" onClick={() => setOpen(true)}>
            Yes
          </Button>
          <Button size="pill" variant="goldGhost" onClick={notNow}>
            Not now
          </Button>
        </div>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="space-y-5">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
          Current style
        </div>
        <StylePicker
          value={current}
          onChange={setCurrent}
          attributes={currentAttrs}
          onAttributesChange={setCurrentAttrs}
          attributesRequired={false}
        />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-2">
          Planned next style
        </div>
        <StylePicker
          value={planned}
          onChange={setPlanned}
          attributes={plannedAttrs}
          onAttributesChange={setPlannedAttrs}
          includeNotSureYet
          attributesRequired={false}
        />
      </div>

      <div className="flex gap-2">
        <Button size="pill" variant="gold" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="pill" variant="goldGhost" onClick={notNow} disabled={saving}>
          Not now
        </Button>
      </div>
    </SurfaceCard>
  );
};

export default StyleProfilePrompt;
