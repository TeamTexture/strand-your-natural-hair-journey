// Read/write the member's encrypted sensitivity record.
//
// Reads decrypt through the JWT-gated `data-decrypt-context` edge function
// (the `sensitivities` slice); writes encrypt through `data-encrypt-batch` and
// store the `\x...` pg_hex string PostgREST needs for a bytea column.

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  encryptForStorage,
  invalidateClinicalContextCache,
  loadDecryptedContext,
} from "@/lib/clinicalContext";
import { CONFIRM_COLUMN, type SensitivityEntry, type SensitivityScope } from "@/lib/sensitivityVocab";
import { myProfileKey, useMyProfile, type MyProfileRow } from "@/hooks/useMyProfile";

export interface SensitivitySlices {
  topical: SensitivityEntry[];
  dietary: SensitivityEntry[];
}

export const sensitivitiesKey = (userId: string | undefined) => ["sensitivities", userId ?? "anon"];

interface DecryptedSensitivities {
  sensitivities?: { topical?: SensitivityEntry[]; dietary?: SensitivityEntry[] } | null;
}

const clean = (list: unknown): SensitivityEntry[] =>
  Array.isArray(list)
    ? list
        .filter((e): e is SensitivityEntry => !!e && typeof (e as SensitivityEntry).label === "string")
        .map((e) => ({
          code: typeof e.code === "string" ? e.code : null,
          label: e.label,
          severity: e.severity === "limit" || e.severity === "dislike" ? e.severity : "avoid",
          custom: !!e.custom,
        }))
    : [];

export function useSensitivities() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useMyProfile();

  const query = useQuery<SensitivitySlices>({
    queryKey: sensitivitiesKey(user?.id),
    enabled: !!user?.id,
    // Shelf-heavy pages mount this hook once per card. React Query dedupes on
    // the key, and the underlying decrypt read is itself shared with
    // loadClinicalContext (30s in-module cache), so a page load costs at most
    // one data-decrypt-context invocation no matter how many cards render.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const data = (await loadDecryptedContext()) as DecryptedSensitivities | null;
      const slice = data?.sensitivities ?? null;
      return { topical: clean(slice?.topical), dietary: clean(slice?.dietary) };
    },
  });

  const row = profile ?? null;

  const confirmedAt = useCallback(
    (scope: SensitivityScope): string | null => row?.[CONFIRM_COLUMN[scope]] ?? null,
    [row],
  );

  /**
   * Persist one scope. Always stamps the confirmation timestamp — an empty
   * list saved deliberately means "I have none", which is a real answer.
   */
  const save = useCallback(
    async (scope: SensitivityScope, entries: SensitivityEntry[]) => {
      if (!user?.id) return;
      const payload = JSON.stringify(
        entries.map((e) => ({
          code: e.code ?? null,
          label: e.label,
          severity: e.severity,
          custom: !!e.custom,
        })),
      );
      const enc = await encryptForStorage([{ id: "entries", plaintext: payload }]);
      const { error } = await supabase
        .from("user_sensitivities")
        .upsert(
          {
            user_id: user.id,
            applies_to: scope,
            entries_enc: enc.entries as unknown as string,
          } as never,
          { onConflict: "user_id,applies_to" },
        );
      if (error) throw new Error(error.message);

      const now = new Date().toISOString();
      const column = CONFIRM_COLUMN[scope];
      await supabase
        .from("profiles")
        .update({ [column]: now } as never)
        .eq("user_id", user.id);

      qc.setQueryData<MyProfileRow | null>(myProfileKey(user.id), (old) =>
        old ? ({ ...(old as unknown as Record<string, unknown>), [column]: now } as unknown as MyProfileRow) : old,
      );
      qc.setQueryData<SensitivitySlices>(sensitivitiesKey(user.id), (old) => ({
        topical: scope === "topical" ? entries : old?.topical ?? [],
        dietary: scope === "dietary" ? entries : old?.dietary ?? [],
      }));
      invalidateClinicalContextCache();
      void qc.invalidateQueries({ queryKey: sensitivitiesKey(user.id) });
    },
    [qc, user?.id],
  );

  return {
    topical: query.data?.topical ?? [],
    dietary: query.data?.dietary ?? [],
    entriesFor: (scope: SensitivityScope) =>
      scope === "dietary" ? query.data?.dietary ?? [] : query.data?.topical ?? [],
    loading: query.isLoading,
    confirmedAt,
    save,
    reload: () => qc.invalidateQueries({ queryKey: sensitivitiesKey(user?.id) }),
  };
}
