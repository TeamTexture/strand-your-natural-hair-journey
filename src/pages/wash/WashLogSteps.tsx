// PAGE 1 OF 2 — steps and products.
//
// One flat list of the wash-day steps. No accordions, no sub-pages. Each row
// pre-fills from her Wash Day Favourites; swapping here changes THIS LOG ONLY.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { CalendarDays, Heart, Plus } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import ProductThumb from "@/components/ProductThumb";
import ProductPickerSheet from "@/components/ProductPickerSheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useWashFavourites, useWashFavouriteSkips, useWashFavouriteTools } from "@/hooks/useWashFavourites";
import WashToolsSection from "@/components/washday/WashToolsSection";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { WashStepEntry } from "@/lib/washSteps";
import SinceLastWashCard from "@/components/washday/SinceLastWashCard";
import { useWashDraftHydration } from "@/hooks/useWashDraftHydration";
import { readWashDraft, writeWashDraft, clearWashDraft } from "@/lib/washDraft";
import { WASH_LOG_GROUPS, WASH_LOG_STEPS, friendlyWashDate, localIsoDate, visibleSlotCount } from "@/lib/washLogSteps";
import StepSkipRow from "@/components/washday/StepSkipRow";
import { cn } from "@/lib/utils";
import { smartBack } from "@/lib/smartBack";
import { toast } from "sonner";


interface RowState {
  productId: string | null;
  used: boolean;
  /** Deliberately skipped this wash — Pre-poo and Mask only. */
  skipped?: boolean;
}

type RowMap = Record<string, RowState>;

/**
 * Editing an existing wash day reuses this exact flow. The row we loaded is
 * parked on the draft so page 2 can pre-fill from it and UPDATE instead of
 * inserting a second log.
 */
export interface WashEditSnapshot {
  id: string;
  styling: Record<string, unknown> | null;
  note: string | null;
  rating: number | null;
  mediaPath: string | null;
  mediaType: "photo" | "video" | null;
  audioPath: string | null;
  styleAfter: string | null;
  styleTension: string | null;
  styleExtensions: boolean | null;
}

const WashLogStepsInner = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { products } = useUserProducts("shelf");
  const { data: favourites, isLoading: favsLoading, refetch: refetchFavs } = useWashFavourites();
  const { data: favSkips, refetch: refetchSkips } = useWashFavouriteSkips();
  const { data: favTools, refetch: refetchTools } = useWashFavouriteTools();


  const dateFromQuery = params.get("date");
  const editId = params.get("edit");
  const saved = readWashDraft<{ date?: string; rows?: RowMap; toolIds?: string[] }>(
    "strand_wash_log_steps",
    {},
  );
  const [date, setDate] = useState<string>(
    dateFromQuery && /^\d{4}-\d{2}-\d{2}$/.test(dateFromQuery)
      ? dateFromQuery
      : saved.date ?? localIsoDate(),
  );
  const [rows, setRows] = useState<RowMap>(saved.rows ?? {});
  const [toolIds, setToolIds] = useState<string[]>(saved.toolIds ?? []);
  const [seeded, setSeeded] = useState(!!saved.rows);
  const [pickerStep, setPickerStep] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);

  // Keep the chosen date on the draft so page 2 saves against it.
  useEffect(() => {
    setDate((cur) => cur || localIsoDate());
  }, []);

  /**
   * EDIT MODE — load the saved wash day and pre-fill every slot with what was
   * actually logged that day. Favourites never overwrite an edit.
   */
  useEffect(() => {
    if (!editId) {
      // Starting a fresh log: drop any leftover edit snapshot.
      const stale = readWashDraft<Partial<WashEditSnapshot>>("strand_wash_log_edit", {});
      if (stale.id) clearWashDraft("strand_wash_log_edit");
      return;
    }
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("wash_days")
        .select("*")
        .eq("id", editId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        toast.error("We couldn't open that wash day.");
        navigate("/wash-day", { replace: true });
        return;
      }
      const wd = data as unknown as {
        id: string;
        wash_date: string;
        steps: WashStepEntry[] | null;
        tool_ids: string[] | null;
        styling: Record<string, unknown> | null;
        hair_feel_note: string | null;
        hair_feel_voice_url: string | null;
        rating: number | null;
        media_path: string | null;
        media_type: string | null;
        style_after: string | null;
        style_tension: string | null;
        style_extensions: boolean | null;
      };
      const logged = new Map((wd.steps ?? []).map((s) => [s.name, s.product_id ?? null]));
      const next: RowMap = {};
      for (const step of WASH_LOG_STEPS) {
        const productId = logged.get(step.stored) ?? null;
        next[step.stored] = { productId, used: !!productId, skipped: false };
      }
      setRows(next);
      setDate(wd.wash_date);
      setToolIds(wd.tool_ids ?? []);
      setSeeded(true);
      writeWashDraft("strand_wash_log_edit", {
        id: wd.id,
        styling: wd.styling ?? null,
        note: wd.hair_feel_note,
        rating: wd.rating,
        mediaPath: wd.media_path,
        mediaType: (wd.media_type as "photo" | "video" | null) ?? null,
        audioPath: wd.hair_feel_voice_url,
        styleAfter: wd.style_after,
        styleTension: wd.style_tension,
        styleExtensions: wd.style_extensions,
      } satisfies WashEditSnapshot);
      setLoadingEdit(false);
    })();
    return () => { cancelled = true; };
  }, [editId, user, navigate]);

  // Pre-fill from favourites once, only when this log has no answers yet.
  useEffect(() => {
    if (editId || seeded || favsLoading) return;
    const next: RowMap = {};
    for (const step of WASH_LOG_STEPS) {
      const fav = favourites?.[step.stored] ?? null;
      next[step.stored] = {
        productId: fav,
        used: !!fav,
        skipped: !fav && !!favSkips?.includes(step.stored),
      };
    }
    setRows(next);
    setToolIds((prev) => (prev.length ? prev : favTools ?? []));
    setSeeded(true);
  }, [favourites, favSkips, favTools, favsLoading, seeded, editId]);

  /**
   * Re-apply the LATEST saved favourites over this log on demand. The auto
   * pre-fill above only runs once (and never when a draft already exists), so
   * this is how an edit made in the favourites builder reaches an open log.
   */
  const applyFavourites = async () => {
    const [favRes, skipRes, toolRes] = await Promise.all([
      refetchFavs(),
      refetchSkips(),
      refetchTools(),
    ]);
    const favMap = favRes.data ?? {};
    const skips = skipRes.data ?? [];
    if (toolRes.data?.length) setToolIds(toolRes.data);
    setRows((prev) => {
      const next: RowMap = { ...prev };
      for (const step of WASH_LOG_STEPS) {
        const fav = favMap[step.stored] ?? null;
        const skip = !fav && skips.includes(step.stored);
        if (!fav && !skip) continue;
        next[step.stored] = { productId: fav, used: !!fav, skipped: skip };
      }
      return next;
    });
    setSeeded(true);
    toast.success("Updated from your Wash Day Favourites");
  };

  const byId = useMemo(() => {
    const map: Record<string, (typeof products)[number]> = {};
    for (const p of products) map[p.id] = p;
    return map;
  }, [products]);


  const setRow = (step: string, patch: Partial<RowState>) =>
    setRows((prev) => ({
      ...prev,
      [step]: { productId: null, used: false, ...prev[step], ...patch },
    }));

  /**
   * AUTOSAVE — every answer is written to the durable draft as she gives it,
   * not only when she taps Next. A member who closes the app mid-log keeps
   * what she entered, and the Wash Day page can offer it back as an
   * "Incomplete" wash day. Nothing is written to `wash_days` until she saves.
   */
  useEffect(() => {
    if (loadingEdit || !seeded) return;
    writeWashDraft("strand_wash_log_steps", { date, rows, toolIds });
    writeWashDraft("strand_wash_date", date);
  }, [date, rows, toolIds, seeded, loadingEdit]);

  const next = () => {
    writeWashDraft("strand_wash_log_steps", { date, rows, toolIds });
    writeWashDraft("strand_wash_date", date);
    navigate("/wash/log/style");
  };

  const activeStep = WASH_LOG_STEPS.find((s) => s.stored === pickerStep) ?? null;

  if (loadingEdit) return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar
        title={editId ? "Edit wash day" : "Log a wash day"}
        onBack={smartBack(navigate, editId ? `/wash-day/${editId}` : "/wash-day")}
      />

      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-3.5 text-primary shrink-0" aria-hidden />
          <p className="font-body text-[12.5px] text-foreground/80">{friendlyWashDate(date)}</p>
          <button
            type="button"
            onClick={() => navigate("/wash-day#wash-calendar")}
            className="text-[11px] uppercase tracking-[0.14em] text-primary font-medium min-h-[32px]"
          >
            Change date
          </button>
        </div>
      </div>

      {!editId && (
      <div className="px-5 pb-1">
        <Button variant="gold" size="pill" onClick={() => void applyFavourites()}>
          <Heart className="size-4" aria-hidden />
          Update from favourites
        </Button>
      </div>
      )}

      {/* What she did between washes — read-only, collapsed by default. */}
      {!editId && <SinceLastWashCard />}





      <div className="px-5 pb-8 space-y-2.5">
        {WASH_LOG_GROUPS.map((group) => {
          const shown = visibleSlotCount(group, (stored) => !!rows[stored]?.productId);
          return (
            <div key={group.key} className="space-y-2.5">
              <p className="pt-1 text-[10.5px] uppercase tracking-[0.18em] text-foreground/60 font-medium">
                {group.label}
              </p>
              {group.slots.slice(0, shown).map((step) => {
                const row = rows[step.stored] ?? { productId: null, used: false };
                const product = row.productId ? byId[row.productId] : undefined;
                const skipped = !!row.skipped;
                return (
                  <div
                    key={step.stored}
                    className={cn(
                      "rounded-[14px] border border-border bg-card p-3",
                      skipped && "opacity-60",
                    )}
                  >
                    {skipped ? (
                      <>
                        <span className="block text-[10px] uppercase tracking-[0.16em] text-primary font-medium">
                          {step.label}
                        </span>
                        <StepSkipRow
                          label={step.label}
                          skipped
                          skippedLabel="Skipped this wash"
                          onSkip={() => setRow(step.stored, { skipped: true })}
                          onUndo={() => setRow(step.stored, { skipped: false })}
                        />
                      </>
                    ) : (
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={row.used}
                        disabled={!row.productId}
                        onCheckedChange={(v) => setRow(step.stored, { used: v === true })}
                        aria-label={`${step.label} used today`}
                      />

                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Choose the product for ${step.label}`}
                        onClick={() => setPickerStep(step.stored)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setPickerStep(step.stored);
                        }}
                        className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                      >
                        {product ? (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/products/profile/${product.id}`);
                            }}
                            className="shrink-0"
                          >
                            <ProductThumb
                              imageUrl={product.image_url}
                              storagePath={product.storage_path}
                              alt={product.name}
                              cover
                              wrapperClassName="size-[34px] rounded-[7px] overflow-hidden bg-secondary shrink-0"
                            />
                          </span>
                        ) : (
                          <span className="size-[34px] rounded-[7px] border border-dashed border-border flex items-center justify-center shrink-0">
                            <Plus className="size-3.5 text-muted-foreground" aria-hidden />
                          </span>
                        )}

                        <span className="flex-1 min-w-0">
                          <span className="block text-[10px] uppercase tracking-[0.16em] text-primary font-medium">
                            {step.label}
                          </span>
                          {product ? (
                            <Link
                              to={`/products/profile/${product.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="block product-title text-[13px] leading-snug break-words [overflow-wrap:anywhere] underline decoration-primary/40 underline-offset-2"
                            >
                              {product.name}
                            </Link>
                          ) : (
                            <span className="block font-body text-[12.5px] text-muted-foreground">
                              Not set — tap to add from your shelf
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                    )}
                    {group.skippable && !skipped && !row.productId && (
                      <StepSkipRow
                        label={step.label}
                        skipped={false}
                        skippedLabel="Skipped this wash"
                        onSkip={() => setRow(step.stored, { skipped: true, productId: null, used: false })}
                        onUndo={() => setRow(step.stored, { skipped: false })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}




        <WashToolsSection
          toolIds={toolIds}
          onChange={setToolIds}
          description="Combs, brushes, dryers, clips — up to three from your tools."
        />

        <Button variant="gold" size="pill" className="mt-2" onClick={next}>
          Next
        </Button>
      </div>

      <ProductPickerSheet
        open={pickerStep !== null}
        onOpenChange={(o) => { if (!o) setPickerStep(null); }}
        selectedIds={pickerStep && rows[pickerStep]?.productId ? [rows[pickerStep].productId as string] : []}
        stepHint={activeStep?.hint ?? null}
        onToggle={(productId) => {
          if (!pickerStep) return;
          const current = rows[pickerStep]?.productId;
          if (current === productId) {
            setRow(pickerStep, { productId: null, used: false });
          } else {
            setRow(pickerStep, { productId, used: true });
          }
          setPickerStep(null);
        }}
      />
    </ScreenLayout>
  );
};

const WashLogSteps = () => {
  const { ready } = useWashDraftHydration();
  if (!ready) return <LoadingDot />;
  return <WashLogStepsInner />;
};

export default WashLogSteps;
