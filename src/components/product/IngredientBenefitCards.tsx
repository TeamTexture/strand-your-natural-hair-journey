import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import GlossaryRichText from "@/components/ingredients/GlossaryRichText";
import { GlossaryLabel } from "@/components/ingredients/IngredientToken";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchIngredientExplainer,
  type IngredientExplainer,
} from "@/hooks/useIngredientExplainer";
import { buildAiContext, type AiContext } from "@/lib/aiContext";
import { currentProfileHash } from "@/lib/profileSnapshot";
import {
  INGREDIENT_BENEFITS,
  ingredientBenefitCacheKey,
  ingredientPersonalizationText,
  selectBenefitIngredients,
  simplifyIngredientName,
  type BenefitIngredientCandidate,
  type IngredientBenefitRole,
  type IngredientPersonalizationProfile,
} from "@/lib/ingredientPersonalization";

interface BenefitCardState {
  expanded: boolean;
  loading: boolean;
  science: IngredientExplainer | null;
}

const EMPTY_CARD: BenefitCardState = { expanded: false, loading: false, science: null };

const firstString = (value: unknown): string => {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return typeof value === "string" ? value : "";
};

export function ingredientBenefitProfile(context: AiContext): IngredientPersonalizationProfile {
  const hair = context.hairProfile ?? {};
  return {
    porosity: firstString(hair.porosity),
    goals: context.goals
      .filter((goal) => goal.status !== "past")
      .map((goal) => ({ title: goal.title }))
      .filter((goal) => goal.title.trim().length > 0),
    challenges: context.challenges,
    climate: "",
    stylingHabits: context.currentStyle?.current_hairstyle ?? "",
  };
}

const scienceText = (science: IngredientExplainer | null): string =>
  [science?.glossary?.what_it_is, science?.role_in_product]
    .filter((line): line is string => Boolean(line?.trim()))
    .join(" ");

export default function IngredientBenefitCards({
  ingredients,
  productId,
}: {
  ingredients: BenefitIngredientCandidate[];
  productId: string | null;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [context, setContext] = useState<AiContext | null>(null);
  const [cards, setCards] = useState<Record<IngredientBenefitRole, BenefitCardState>>({
    hydration: EMPTY_CARD,
    protection: EMPTY_CARD,
    "moisture-lock": EMPTY_CARD,
  });
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const selections = useMemo(
    () => Object.fromEntries(
      INGREDIENT_BENEFITS.map((benefit) => [
        benefit.role,
        selectBenefitIngredients(ingredients, benefit.role),
      ]),
    ) as Record<IngredientBenefitRole, BenefitIngredientCandidate[]>,
    [ingredients],
  );

  const profile = useMemo(() => context ? ingredientBenefitProfile(context) : null, [context]);
  const profileHash = useMemo(() => context ? currentProfileHash(context) : "pending", [context]);

  const queryFor = (role: IngredientBenefitRole) => {
    const ingredient = selections[role][0];
    if (!ingredient || !productId || !user?.id || !context) return null;
    return {
      queryKey: ingredientBenefitCacheKey(productId, user.id, profileHash, role, ingredient.name),
      queryFn: () => fetchIngredientExplainer(ingredient.name, productId),
      staleTime: Number.POSITIVE_INFINITY,
      retry: false as const,
    };
  };

  // Smart prefetch: nothing in this effect participates in the initial render.
  // Each card warms independently, so one failure cannot cascade into another.
  useEffect(() => {
    if (!productId || !user?.id) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        let nextContext: AiContext;
        try {
          nextContext = await buildAiContext();
        } catch {
          return;
        }
        if (cancelled || !mounted.current) return;
        setContext(nextContext);
        const nextHash = currentProfileHash(nextContext);
        for (const benefit of INGREDIENT_BENEFITS) {
          const ingredient = selections[benefit.role][0];
          if (!ingredient) continue;
          const queryKey = ingredientBenefitCacheKey(
            productId,
            user.id,
            nextHash,
            benefit.role,
            ingredient.name,
          );
          void queryClient.prefetchQuery({
            queryKey,
            queryFn: () => fetchIngredientExplainer(ingredient.name, productId),
            staleTime: Number.POSITIVE_INFINITY,
            retry: false,
          });
        }
      })();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [productId, queryClient, selections, user?.id]);

  const toggleScience = async (role: IngredientBenefitRole) => {
    const current = cards[role];
    if (current.expanded) {
      setCards((prev) => ({ ...prev, [role]: { ...prev[role], expanded: false } }));
      return;
    }
    setCards((prev) => ({ ...prev, [role]: { ...prev[role], expanded: true } }));
    if (current.science || current.loading) return;

    let activeContext = context;
    if (!activeContext) {
      try {
        activeContext = await buildAiContext();
        if (mounted.current) setContext(activeContext);
      } catch {
        return;
      }
    }
    const ingredient = selections[role][0];
    if (!ingredient || !productId || !user?.id || !activeContext) return;
    const key = ingredientBenefitCacheKey(
      productId,
      user.id,
      currentProfileHash(activeContext),
      role,
      ingredient.name,
    );
    setCards((prev) => ({ ...prev, [role]: { ...prev[role], loading: true } }));
    try {
      const science = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: () => fetchIngredientExplainer(ingredient.name, productId),
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
      });
      if (mounted.current) {
        setCards((prev) => ({ ...prev, [role]: { expanded: true, loading: false, science } }));
      }
    } catch {
      // Deliberately quiet: the open card keeps its neutral analysing state.
    }
  };

  return (
    <section className="mt-3" aria-label="What's inside this formulation">
      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-foreground/50 font-body">
        What's inside this formulation
      </p>
      <div className="space-y-2">
        {INGREDIENT_BENEFITS.map((benefit) => {
          const selected = selections[benefit.role];
          const lead = selected[0];
          const state = cards[benefit.role];
          const ingredientNames = selected.map((item) => simplifyIngredientName(item.name)).filter(Boolean);
          const paragraph = lead && profile
            ? ingredientPersonalizationText(
                {
                  name: lead.name,
                  INCI: lead.name,
                  role: benefit.role,
                  howItWorks: lead.body ?? "",
                },
                profile,
              )
            : lead
              ? "Matching this ingredient to your recorded hair profile…"
              : "This benefit isn't established from the verified ingredients in this formula.";
          const detail = scienceText(state.science);

          return (
            <article
              key={benefit.role}
              className="rounded-[12px] border border-border/60 bg-background/70 px-3 py-3"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-xl leading-none" aria-hidden>{benefit.emoji}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-[15px] font-semibold leading-tight text-foreground">
                    {benefit.title}
                  </h3>
                  <p className="mt-0.5 text-[11.5px] font-semibold leading-snug text-primary [overflow-wrap:anywhere]">
                    {lead ? ingredientNames.map((name, index) => (
                      <span key={`${benefit.role}-${name}`}>
                        {index > 0 ? " + " : ""}
                        <GlossaryLabel label={name} forceToken />
                      </span>
                    )) : "Not established for this formula"}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/75">
                <GlossaryRichText text={paragraph} />
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-auto px-0 py-1 text-[11.5px] text-primary hover:bg-transparent"
                onClick={() => void toggleScience(benefit.role)}
                disabled={!lead}
                aria-expanded={state.expanded}
              >
                {state.expanded ? "Hide ingredient science" : "Show ingredient science"}
                {state.expanded ? <ChevronUp className="ml-1 size-3" /> : <ChevronDown className="ml-1 size-3" />}
              </Button>
              {state.expanded && (
                <div className="mt-1.5 border-t border-border/50 pt-2 text-[12px] leading-relaxed text-foreground/70">
                  {detail ? <GlossaryRichText text={detail} /> : <span>Analysing for you…</span>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
