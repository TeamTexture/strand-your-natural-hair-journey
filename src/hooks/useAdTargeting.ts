// Data layer for personalised ad targeting (consent, vocabulary, reach, rules).
//
// Every privacy rule is enforced in the database:
//  - matching only ever considers members with personalised_offers_consent = true
//  - reach counts are banded for display (see bandMemberCount); brands never
//    see exact member numbers
//  - the resolved audience list is never readable by a brand
// The hooks here are thin wrappers over those RPCs.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cleanRules, rulesAreEmpty, type TargetingOption, type TargetingRules } from "@/lib/adTargeting";
import { recordConsents, withdrawConsent, type ConsentSource } from "@/lib/consent";

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
// Untyped table accessor: several of these tables are new and the generated
// Supabase types have not caught up yet.
/* eslint-disable @typescript-eslint/no-explicit-any */
const table = (name: string) => (supabase as unknown as { from: (t: string) => any }).from(name);

/** The full controlled vocabulary brands may pick from. */
export function useTargetingOptions() {
  return useQuery({
    queryKey: ["ad-targeting-options"],
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<TargetingOption[]> => {
      const { data, error } = await table("ad_targeting_attributes")
        .select("attribute_key, value_code, label, attribute_label, sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TargetingOption[];
    },
  });
}

export interface ReachEstimate {
  reach: number | null;
  meets_floor: boolean;
  audience_floor: number;
}

/** Live reach estimate for an in-progress rule set. Displayed as a band. */
export function useReachEstimate(rules: TargetingRules) {
  const clean = cleanRules(rules);
  const empty = rulesAreEmpty(clean);
  return useQuery({
    queryKey: ["ad-reach-estimate", clean],
    enabled: !empty,
    staleTime: 30_000,
    queryFn: async (): Promise<ReachEstimate> => {
      const { data, error } = await rpc("ad_estimate_reach", { _rules: clean });
      if (error) throw new Error(error.message);
      const row = (data as ReachEstimate[] | null)?.[0];
      return row ?? { reach: null, meets_floor: false, audience_floor: 50 };
    },
  });
}

/** Stored targeting for one campaign, as rules. */
export function useOfferTargeting(offerId: string | undefined) {
  return useQuery({
    queryKey: ["offer-targeting", offerId],
    enabled: !!offerId,
    queryFn: async (): Promise<TargetingRules> => {
      const { data, error } = await table("brand_offer_targeting")
        .select("attribute_key, value_code")
        .eq("offer_id", offerId!);
      if (error) throw new Error(error.message);
      const out: TargetingRules = {};
      for (const r of (data ?? []) as unknown as { attribute_key: string; value_code: string }[]) {
        (out[r.attribute_key] ??= []).push(r.value_code);
      }
      return out;
    },
  });
}

/** Replace a campaign's targeting rows (draft / under review only — RLS enforces). */
export async function saveOfferTargeting(offerId: string, rules: TargetingRules) {
  const clean = cleanRules(rules);
  const { error: delError } = await table("brand_offer_targeting").delete().eq("offer_id", offerId);
  if (delError) throw new Error(delError.message);
  const rows = Object.entries(clean).flatMap(([attribute_key, codes]) =>
    codes.map((value_code) => ({ offer_id: offerId, attribute_key, value_code })),
  );
  if (rows.length === 0) return;
  const { error } = await table("brand_offer_targeting").insert(rows as never);
  if (error) throw new Error(error.message);
}

/** Reach for a saved campaign (brand dashboard / admin review). */
export function useOfferReach(offerId: string | undefined) {
  return useQuery({
    queryKey: ["offer-reach", offerId],
    enabled: !!offerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await rpc("ad_offer_reach", { _offer_id: offerId });
      if (error) throw new Error(error.message);
      return ((data as (ReachEstimate & { is_targeted: boolean })[] | null)?.[0]) ?? null;
    },
  });
}

/* ── Member consent ───────────────────────────────────────────────────────── */

export function usePersonalisedOffersConsent() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["personalised-offers-consent", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await table("profiles")
        .select("personalised_offers_consent")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return !!(data as unknown as { personalised_offers_consent?: boolean } | null)?.personalised_offers_consent;
    },
  });
}

export function useSetPersonalisedOffersConsent() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: boolean | { on: boolean; source?: ConsentSource }) => {
      const on = typeof input === "boolean" ? input : input.on;
      const source: ConsentSource =
        typeof input === "boolean" ? "settings" : input.source ?? "settings";
      const { error } = await rpc("set_personalised_offers_consent", { _on: on, _source: source });
      if (error) throw new Error(error.message);
      // Append-only consent ledger: a withdrawal writes a NEW granted=false row.
      if (on) await recordConsents({ personalised_offers: true }, source);
      else await withdrawConsent("personalised_offers", source);
      return on;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personalised-offers-consent", user?.id] });
      qc.invalidateQueries({ queryKey: ["active-brand-offer"] });
    },
  });
}

/** Permanent "not relevant to my hair" signal for one campaign. */
export function useDismissAdOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) => {
      const { error } = await rpc("ad_dismiss_offer", { _offer_id: offerId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["active-brand-offer"] }),
  });
}
