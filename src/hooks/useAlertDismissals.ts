// Persistent dismissal store for COMPUTED alerts.
//
// An alert renders only if its condition is currently true AND there is no
// `alert_dismissals` row for (user_id, alert_key, trigger_signature).
// Dismissals live in the database so they survive navigation, reload and
// device changes. Dismissing is optimistic: hide immediately, write after,
// and reconcile (un-hide) if the write fails.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DismissalRow {
  alert_key: string;
  trigger_signature: string;
}

const sigOf = (key: string, signature: string) => `${key}::${signature}`;

/** Module-level cache so Home's several alert hooks share one fetch. */
let cache: { userId: string; set: Set<string> } | null = null;
const listeners = new Set<(s: Set<string>) => void>();

const publish = (userId: string, set: Set<string>) => {
  cache = { userId, set };
  listeners.forEach((l) => l(new Set(set)));
};

export function useAlertDismissals() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<Set<string>>(
    () => (cache && user && cache.userId === user.id ? new Set(cache.set) : new Set()),
  );
  const [loaded, setLoaded] = useState<boolean>(() => !!(cache && user && cache.userId === user.id));

  useEffect(() => {
    const l = (s: Set<string>) => setDismissed(s);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setDismissed(new Set());
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("alert_dismissals")
        .select("alert_key, trigger_signature")
        .eq("user_id", user.id);
      if (cancelled) return;
      if (error) {
        setLoaded(true);
        return;
      }
      const set = new Set((data ?? []).map((r) => sigOf(r.alert_key, r.trigger_signature)));
      publish(user.id, set);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const isDismissed = useCallback(
    (key: string, signature: string) => dismissed.has(sigOf(key, signature)),
    [dismissed],
  );

  const dismiss = useCallback(
    async (entries: Array<{ key: string; signature: string }>) => {
      if (!user?.id || entries.length === 0) return;
      const next = new Set(dismissed);
      for (const e of entries) next.add(sigOf(e.key, e.signature));
      publish(user.id, next); // optimistic
      const { error } = await supabase.from("alert_dismissals").upsert(
        entries.map((e) => ({
          user_id: user.id,
          alert_key: e.key,
          trigger_signature: e.signature,
        })),
        { onConflict: "user_id,alert_key,trigger_signature", ignoreDuplicates: true },
      );
      if (error) {
        // Reconcile: drop the optimistic entries again.
        const revert = new Set(cache?.set ?? next);
        for (const e of entries) revert.delete(sigOf(e.key, e.signature));
        publish(user.id, revert);
      }
    },
    [user?.id, dismissed],
  );

  return useMemo(
    () => ({ loaded, isDismissed, dismiss }),
    [loaded, isDismissed, dismiss],
  );
}
