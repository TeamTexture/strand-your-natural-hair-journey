import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import IngredientExplainerSheet from "@/components/ingredients/IngredientExplainerSheet";

interface Ctx {
  /** Opens the explainer sheet for an ingredient name. */
  openIngredient: (name: string, userProductId?: string | null) => void;
  /** Product whose ingredient list the surrounding copy is about, if any. */
  productId: string | null;
}

const IngredientSheetContext = createContext<Ctx | null>(null);

/**
 * Mounts the single app-wide ingredient explainer sheet. Every ingredient name
 * rendered in AI copy, flag rows and INCI chips opens this one sheet, so the
 * cached three-layer payload is shared across surfaces.
 */
export function IngredientSheetProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const openIngredient = useCallback((n: string, pid?: string | null) => {
    setName(n);
    setProductId(pid ?? null);
    setOpen(true);
  }, []);

  const value = useMemo<Ctx>(() => ({ openIngredient, productId: null }), [openIngredient]);

  return (
    <IngredientSheetContext.Provider value={value}>
      {children}
      <IngredientExplainerSheet
        name={name}
        userProductId={productId}
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setName(null);
        }}
      />
    </IngredientSheetContext.Provider>
  );
}

/**
 * Scopes the ingredient tokens inside it to one product, so the sheet can
 * explain what the ingredient is doing in *that* formula.
 */
export function IngredientProductScope({
  productId,
  children,
}: {
  productId: string | null | undefined;
  children: React.ReactNode;
}) {
  const parent = useContext(IngredientSheetContext);
  const value = useMemo<Ctx>(
    () => ({
      openIngredient: (n, pid) => parent?.openIngredient(n, pid ?? productId ?? null),
      productId: productId ?? null,
    }),
    [parent, productId],
  );
  if (!parent) return <>{children}</>;
  return <IngredientSheetContext.Provider value={value}>{children}</IngredientSheetContext.Provider>;
}

export function useIngredientSheet() {
  return useContext(IngredientSheetContext);
}

/**
 * IngredientToken — a tappable ingredient name inside body copy. Styled as a
 * dotted-underline term rather than a link, because it opens an explainer in
 * place instead of navigating away.
 */
export function IngredientToken({
  name,
  label,
  className,
}: {
  name: string;
  label?: string;
  className?: string;
}) {
  const ctx = useIngredientSheet();
  if (!ctx) return <>{label ?? name}</>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        ctx.openIngredient(name, ctx.productId);
      }}
      className={cn(
        "inline text-left font-medium text-foreground underline decoration-dotted decoration-primary/70 decoration-1 underline-offset-2 hover:decoration-primary transition",
        className,
      )}
    >
      {label ?? name}
    </button>
  );
}

export default IngredientToken;
