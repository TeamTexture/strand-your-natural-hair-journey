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
import { useWashFavourites } from "@/hooks/useWashFavourites";
import { useWashDraftHydration } from "@/hooks/useWashDraftHydration";
import { readWashDraft, writeWashDraft } from "@/lib/washDraft";
import { WASH_LOG_STEPS, friendlyWashDate, localIsoDate } from "@/lib/washLogSteps";
import { smartBack } from "@/lib/smartBack";

interface RowState {
  productId: string | null;
  used: boolean;
}

type RowMap = Record<string, RowState>;

const WashLogStepsInner = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { products } = useUserProducts("shelf");
  const { data: favourites, isLoading: favsLoading } = useWashFavourites();

  const dateFromQuery = params.get("date");
  const saved = readWashDraft<{ date?: string; rows?: RowMap }>("strand_wash_log_steps", {});
  const [date, setDate] = useState<string>(
    dateFromQuery && /^\d{4}-\d{2}-\d{2}$/.test(dateFromQuery)
      ? dateFromQuery
      : saved.date ?? localIsoDate(),
  );
  const [rows, setRows] = useState<RowMap>(saved.rows ?? {});
  const [seeded, setSeeded] = useState(!!saved.rows);
  const [pickerStep, setPickerStep] = useState<string | null>(null);

  // Keep the chosen date on the draft so page 2 saves against it.
  useEffect(() => {
    setDate((cur) => cur || localIsoDate());
  }, []);

  // Pre-fill from favourites once, only when this log has no answers yet.
  useEffect(() => {
    if (seeded || favsLoading) return;
    const next: RowMap = {};
    for (const step of WASH_LOG_STEPS) {
      const fav = favourites?.[step.stored] ?? null;
      next[step.stored] = { productId: fav, used: !!fav };
    }
    setRows(next);
    setSeeded(true);
  }, [favourites, favsLoading, seeded]);

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

  const next = () => {
    writeWashDraft("strand_wash_log_steps", { date, rows });
    writeWashDraft("strand_wash_date", date);
    navigate("/wash/log/style");
  };

  const activeStep = WASH_LOG_STEPS.find((s) => s.stored === pickerStep) ?? null;

  return (
    <ScreenLayout>
      <TitleBar title="Log a wash day" onBack={smartBack(navigate, "/wash-day")} />

      <div className="px-5 pb-2">
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

      <div className="px-5 pb-8 space-y-2.5">
        {WASH_LOG_STEPS.map((step) => {
          const row = rows[step.stored] ?? { productId: null, used: false };
          const product = row.productId ? byId[row.productId] : undefined;
          return (
            <div
              key={step.stored}
              className="rounded-[14px] border border-border bg-card p-3"
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={row.used}
                  disabled={!row.productId}
                  onCheckedChange={(v) => setRow(step.stored, { used: v === true })}
                  aria-label={`${step.label} used today`}
                />

                <button
                  type="button"
                  aria-label={`Swap the product for ${step.label}`}
                  onClick={() => setPickerStep(step.stored)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left"
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
                        Not used today — tap to add a product
                      </span>
                    )}
                  </span>
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => navigate("/wash/favourites")}
          className="w-full inline-flex items-center justify-center gap-1.5 pt-1 text-[11.5px] font-body text-primary min-h-[40px]"
        >
          <Heart className="size-3.5" aria-hidden />
          From your Wash Day Favourites
        </button>

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
