// AI COPY REVISION — the single invalidation stamp for every cached generation.
// ============================================================================
// Bump AI_COPY_REVISION whenever the manuscript source, the retrieval strategy
// or a shared guidance rule changes in a way that makes every existing cached
// generation untrustworthy. Every AI cache key and every generation signature
// in the app mixes this value in, so one bump lazily invalidates the lot: a
// member's copy re-derives the next time they open the surface, and nothing is
// regenerated for content nobody looks at.
//
// This is deliberately NOT a timestamp read at runtime — it is a constant, so
// caches stay stable until someone decides they should not be.
//
// History
//   mr2026-08-09-manuscript  Clean re-ingest of the author's manuscript from
//                            source PDF: all 18 chapter titles corrected to the
//                            authoritative map, whole-chapter retrieval with
//                            chapter 1 in every hair care generation, and the
//                            fidelity fail-safe enforced. Every generation made
//                            before this ran against wrong chapter labels and
//                            fragment retrieval, so all of it is invalidated.
export const AI_COPY_REVISION = "mr2026-08-09-manuscript";

/** Cache-key fragment. Use in every AI cache key and generation signature. */
export const aiRevisionPart = `rev:${AI_COPY_REVISION}`;
