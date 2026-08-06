// Stable identifiers for COMPUTED alerts (Home health alerts + STRAND+ activity
// alerts). These are alert *types* — never per-instance ids — and they double as
// the stable element ids used by scroll restoration (`alert-<key>`).
//
// Dismissal model: a dismissal row in `alert_dismissals` is keyed by
// (user_id, alert_key, trigger_signature). The signature captures the facts
// that raised THIS instance. For time-based alerts the signature also carries a
// coarse time bucket, so the alert can re-raise as the situation genuinely
// worsens — but never on a mere page revisit.

export const ALERT_KEYS = {
  // Time / cadence based (bucketed)
  WASH_OVERDUE: "wash_overdue",
  WASH_COUNTDOWN: "wash_countdown",
  TAKEDOWN_DUE: "takedown_due",
  PLANNED_STYLE_DUE: "planned_style_due",
  BLOOD_TEST_OVERDUE: "blood_test_overdue",
  BLOOD_TEST_MISSING: "blood_test_missing",
  BLOOD_TEST_SCHEDULED: "blood_test_scheduled",
  BLOOD_MARKERS_FLAGGED: "blood_markers_flagged",
  REBOOK_PRO: "rebook_pro",
  MILESTONE_PHOTO_DUE: "milestone_photo_due",

  // Record / event based (no bucket)
  APPOINTMENT_UPCOMING: "appointment_upcoming",
  BREAKAGE_LOGGED: "breakage_logged",
  LOW_RATED_ON_SHELF: "low_rated_on_shelf",
  GOAL_TARGET_PASSED: "goal_target_passed",
  GOAL_COMPLETE: "goal_complete",
  WASH_RECENT: "wash_recent",
  WASH_STREAK: "wash_streak",
  JOURNAL_RECENT: "journal_recent",
  FAVOURITE_PRODUCT: "favourite_product",

  // STRAND+ activity (event based — signature is the source record id)
  PLUS_FORUM_THREAD: "plus_forum_thread",
  PLUS_FORUM_REPLY: "plus_forum_reply",
  PLUS_EVENT: "plus_event",
  PLUS_MESSAGE: "plus_message",
  PLUS_LIBRARY_ITEM: "plus_library_item",
  PLUS_LIBRARY_COLLECTION: "plus_library_collection",
} as const;

export type AlertKey = (typeof ALERT_KEYS)[keyof typeof ALERT_KEYS];

/**
 * Re-raise bucket interval, in DAYS, per time-based alert type.
 * Tune here — never inline in a component. `null` = event-based, no bucket.
 * Default for time-based health prompts is quarterly (90 days).
 */
const QUARTER = 90;

export const ALERT_BUCKET_DAYS: Partial<Record<AlertKey, number>> = {
  [ALERT_KEYS.WASH_OVERDUE]: 7, // weekly — short-cycle cadence prompt
  [ALERT_KEYS.WASH_COUNTDOWN]: 7,
  [ALERT_KEYS.TAKEDOWN_DUE]: 14, // fortnightly once a style is overdue
  [ALERT_KEYS.PLANNED_STYLE_DUE]: 7,
  [ALERT_KEYS.BLOOD_TEST_OVERDUE]: QUARTER,
  [ALERT_KEYS.BLOOD_TEST_MISSING]: QUARTER,
  [ALERT_KEYS.BLOOD_TEST_SCHEDULED]: QUARTER,
  [ALERT_KEYS.BLOOD_MARKERS_FLAGGED]: QUARTER,
  [ALERT_KEYS.REBOOK_PRO]: QUARTER,
  [ALERT_KEYS.MILESTONE_PHOTO_DUE]: 42, // matches the 6-week photo cadence
};

/** Coarse time bucket: floor(days / interval). Returns 0 when not applicable. */
export const timeBucket = (key: AlertKey, days: number): number => {
  const interval = ALERT_BUCKET_DAYS[key];
  if (!interval || !Number.isFinite(days)) return 0;
  return Math.floor(Math.max(0, days) / interval);
};

/** Build a trigger signature from a key plus the facts that raised it. */
export const alertSignature = (
  key: AlertKey,
  facts: Array<string | number | null | undefined>,
): string => [key, ...facts.map((f) => (f === null || f === undefined ? "-" : String(f)))].join("|");

/** Stable DOM id for scroll restoration / anchors. */
export const alertAnchorId = (key: string) => `alert-${key}`;
