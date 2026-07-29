/**
 * Shared signed-URL memo for private storage buckets.
 *
 * Screens like Home mount several components that each need a signed URL for
 * the same object (product thumbnails, avatars, brand creative). Without this
 * they each fire their own /object/sign request. This caches by
 * `bucket:path` and de-duplicates in-flight requests.
 */
import { supabase } from "@/integrations/supabase/client";

const TTL_SECONDS = 3600;
/** Refresh a little before the token actually expires. */
const CACHE_MS = (TTL_SECONDS - 600) * 1000;

const cache = new Map<string, { url: string; expires: number }>();
const inflight = new Map<string, Promise<string | null>>();

export async function getSignedUrl(bucket: string, path: string): Promise<string | null> {
  const key = `${bucket}:${path}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, TTL_SECONDS);
    const url = data?.signedUrl ?? null;
    if (url) cache.set(key, { url, expires: Date.now() + CACHE_MS });
    inflight.delete(key);
    return url;
  })();
  inflight.set(key, request);
  return request;
}

/** Drop a cached URL after the underlying object is replaced or removed. */
export function invalidateSignedUrl(bucket: string, path: string) {
  cache.delete(`${bucket}:${path}`);
}
