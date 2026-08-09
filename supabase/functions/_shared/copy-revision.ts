// AI COPY REVISION — edge-side mirror of src/lib/aiCopyRevision.ts.
// Keep the two values identical: the client builds signatures with its copy and
// the functions stamp server-side caches with this one, so a mismatch would let
// stale server copy survive a client invalidation.
//
// See src/lib/aiCopyRevision.ts for the history and the bump rules.
export const AI_COPY_REVISION = "mr2026-08-09-manuscript";

/** Suffix for a function's MODEL_VERSION / cache version string. */
export const revisionSuffix = `@${AI_COPY_REVISION}`;
