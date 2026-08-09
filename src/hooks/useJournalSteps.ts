import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Style record steps — the step-by-step timeline hanging off a journal entry.
 *
 * One entry = one style record. Steps are unlimited, reorderable, editable and
 * deletable; a database trigger renumbers the remaining steps contiguously from
 * 1 whenever one is deleted, so `step_order` is always 1..n with no gaps.
 *
 * Products are NEVER stored here as their own product record — a step links to
 * a row in `user_products` (the shelf), which is the app's single product model.
 */

export interface StepMedia {
  id: string;
  kind: "photo" | "video";
  storage_path: string;
  duration_seconds: number | null;
  sort_order: number;
}

export interface StepProduct {
  id: string;
  user_product_id: string | null;
}

export interface JournalStep {
  id: string;
  entry_id: string;
  step_order: number;
  note: string | null;
  voice_path: string | null;
  voice_transcript: string | null;
  media: StepMedia[];
  products: StepProduct[];
}

export function useJournalSteps(entryId: string | null) {
  const [steps, setSteps] = useState<JournalStep[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!entryId) { setSteps([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("journal_steps")
      .select(
        "id, entry_id, step_order, note, voice_path, voice_transcript, journal_step_media(id, kind, storage_path, duration_seconds, sort_order), journal_step_products(id, user_product_id)",
      )
      .eq("entry_id", entryId)
      .order("step_order", { ascending: true });
    setLoading(false);
    if (error) {
      console.error("journal steps load failed", error);
      return;
    }
    setSteps(
      (data ?? []).map((r) => ({
        id: r.id,
        entry_id: r.entry_id,
        step_order: r.step_order,
        note: r.note,
        voice_path: r.voice_path,
        voice_transcript: r.voice_transcript,
        media: ((r.journal_step_media ?? []) as StepMedia[])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order),
        products: (r.journal_step_products ?? []) as StepProduct[],
      })),
    );
  }, [entryId]);

  useEffect(() => { void load(); }, [load]);

  /** Appends a step at the end. No cap on the number of steps. */
  const addStep = useCallback(async () => {
    if (!entryId) return null;
    const nextOrder = steps.length ? Math.max(...steps.map((s) => s.step_order)) + 1 : 1;
    const { data, error } = await supabase
      .from("journal_steps")
      .insert({ entry_id: entryId, step_order: nextOrder })
      .select("id")
      .single();
    if (error) {
      console.error("add step failed", error);
      toast.error("Couldn't add that step");
      return null;
    }
    await load();
    return data.id as string;
  }, [entryId, steps, load]);

  const updateStep = useCallback(
    async (stepId: string, patch: Partial<Pick<JournalStep, "note" | "voice_path" | "voice_transcript">>) => {
      setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...patch } : s)));
      const { error } = await supabase.from("journal_steps").update(patch).eq("id", stepId);
      if (error) {
        console.error("update step failed", error);
        toast.error("Couldn't save that step");
      }
    },
    [],
  );

  const deleteStep = useCallback(async (stepId: string) => {
    const { error } = await supabase.from("journal_steps").delete().eq("id", stepId);
    if (error) {
      console.error("delete step failed", error);
      toast.error("Couldn't remove that step");
      return;
    }
    // The renumber trigger has already closed the gap — re-read to pick it up.
    await load();
  }, [load]);

  /** Swaps a step with its neighbour. Uses a temporary negative order so the
   *  (entry_id, step_order) unique index is never violated mid-swap. */
  const moveStep = useCallback(
    async (stepId: string, direction: "up" | "down") => {
      const idx = steps.findIndex((s) => s.id === stepId);
      if (idx < 0) return;
      const otherIdx = direction === "up" ? idx - 1 : idx + 1;
      if (otherIdx < 0 || otherIdx >= steps.length) return;
      const a = steps[idx];
      const b = steps[otherIdx];
      const parked = -Math.abs(a.step_order) - 1000;
      await supabase.from("journal_steps").update({ step_order: parked }).eq("id", a.id);
      await supabase.from("journal_steps").update({ step_order: a.step_order }).eq("id", b.id);
      await supabase.from("journal_steps").update({ step_order: b.step_order }).eq("id", a.id);
      await load();
    },
    [steps, load],
  );

  const addMedia = useCallback(
    async (
      stepId: string,
      media: { kind: "photo" | "video"; storage_path: string; duration_seconds?: number | null },
    ) => {
      const existing = steps.find((s) => s.id === stepId)?.media.length ?? 0;
      const { error } = await supabase.from("journal_step_media").insert({
        step_id: stepId,
        kind: media.kind,
        storage_path: media.storage_path,
        duration_seconds: media.duration_seconds ?? null,
        sort_order: existing,
      });
      if (error) {
        console.error("add media failed", error);
        toast.error("Couldn't attach that file");
        return;
      }
      await load();
    },
    [steps, load],
  );

  const removeMedia = useCallback(async (mediaId: string) => {
    const { error } = await supabase.from("journal_step_media").delete().eq("id", mediaId);
    if (error) {
      console.error("remove media failed", error);
      return;
    }
    await load();
  }, [load]);

  const toggleProduct = useCallback(
    async (stepId: string, userProductId: string) => {
      const step = steps.find((s) => s.id === stepId);
      const existing = step?.products.find((p) => p.user_product_id === userProductId);
      if (existing) {
        await supabase.from("journal_step_products").delete().eq("id", existing.id);
      } else {
        const { error } = await supabase
          .from("journal_step_products")
          .insert({ step_id: stepId, user_product_id: userProductId });
        if (error) {
          console.error("attach product failed", error);
          toast.error("Couldn't add that product");
          return;
        }
      }
      await load();
    },
    [steps, load],
  );

  return {
    steps,
    loading,
    reload: load,
    addStep,
    updateStep,
    deleteStep,
    moveStep,
    addMedia,
    removeMedia,
    toggleProduct,
  };
}
