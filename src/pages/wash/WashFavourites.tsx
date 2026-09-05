// Wash Day Favourites — the default product saved against each wash-day step.
// Edits here apply from the NEXT wash day. Past logs keep what was used.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Plus } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import ProductThumb from "@/components/ProductThumb";
import ProductPickerSheet from "@/components/ProductPickerSheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useWashFavourites, useSaveWashFavourites } from "@/hooks/useWashFavourites";
import { WASH_LOG_STEPS } from "@/lib/washLogSteps";
import { smartBack } from "@/lib/smartBack";

const WashFavourites = () => {
  const navigate = useNavigate();
  const { products } = useUserProducts("shelf");
  const { data: favourites, isLoading } = useWashFavourites();
  const save = useSaveWashFavourites();
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [pickerStep, setPickerStep] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const next: Record<string, string | null> = {};
    for (const step of WASH_LOG_STEPS) next[step.stored] = favourites?.[step.stored] ?? null;
    setDraft(next);
  }, [favourites, isLoading]);

  const byId = useMemo(() => {
    const map: Record<string, (typeof products)[number]> = {};
    for (const p of products) map[p.id] = p;
    return map;
  }, [products]);

  const activeStep = WASH_LOG_STEPS.find((s) => s.stored === pickerStep) ?? null;

  const onSave = async () => {
    try {
      await save.mutateAsync(draft);
      toast.success("Wash Day Favourites saved");
      navigate(-1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your favourites");
    }
  };

  if (isLoading) return <LoadingDot />;

  return (
    <ScreenLayout>
      <TitleBar title="Wash Day Favourites" onBack={smartBack(navigate, "/wash-day")} />

      <div className="px-5 pb-8 space-y-2.5">
        <p className="font-body text-[12px] text-muted-foreground">
          Your default product for each step. Applies from the next wash day — past
          logs keep what you actually used.
        </p>

        {WASH_LOG_STEPS.map((step) => {
          const id = draft[step.stored] ?? null;
          const product = id ? byId[id] : undefined;
          return (
            <div key={step.stored} className="rounded-[14px] border border-border bg-card p-3">
              <div className="flex items-center gap-3">
                {product ? (
                  <ProductThumb
                    imageUrl={product.image_url}
                    storagePath={product.storage_path}
                    alt={product.name}
                    cover
                    wrapperClassName="size-[34px] rounded-[7px] overflow-hidden bg-secondary shrink-0"
                  />
                ) : (
                  <span className="size-[34px] rounded-[7px] border border-dashed border-border flex items-center justify-center shrink-0">
                    <Plus className="size-3.5 text-muted-foreground" aria-hidden />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-primary font-medium">
                    {step.label}
                  </p>
                  {product ? (
                    <Link
                      to={`/products/profile/${product.id}`}
                      className="block product-title text-[13px] leading-snug break-words [overflow-wrap:anywhere] underline decoration-primary/40 underline-offset-2"
                    >
                      {product.name}
                    </Link>
                  ) : (
                    <p className="font-body text-[12.5px] text-muted-foreground">Not set</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPickerStep(step.stored)}
                  className="shrink-0 min-h-[36px] px-3 rounded-pill border border-primary/30 bg-primary/10 text-primary text-[11px] uppercase tracking-[0.12em] font-medium"
                >
                  {product ? "Swap" : "Add"}
                </button>
              </div>
            </div>
          );
        })}

        <Button
          variant="gold"
          size="pill"
          className="mt-2"
          onClick={onSave}
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Save favourites"}
        </Button>
      </div>

      <ProductPickerSheet
        open={pickerStep !== null}
        onOpenChange={(o) => { if (!o) setPickerStep(null); }}
        selectedIds={pickerStep && draft[pickerStep] ? [draft[pickerStep] as string] : []}
        stepHint={activeStep?.hint ?? null}
        onToggle={(productId) => {
          if (!pickerStep) return;
          setDraft((prev) => ({
            ...prev,
            [pickerStep]: prev[pickerStep] === productId ? null : productId,
          }));
          setPickerStep(null);
        }}
      />
    </ScreenLayout>
  );
};

export default WashFavourites;
