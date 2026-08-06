import { describe, expect, it } from "vitest";
import { ALERT_BUCKET_DAYS, ALERT_KEYS, alertAnchorId, alertSignature, timeBucket } from "./alertKeys";

describe("alert keys and signatures", () => {
  it("keys are unique and stable", () => {
    const values = Object.values(ALERT_KEYS);
    expect(new Set(values).size).toBe(values.length);
    expect(ALERT_KEYS.BLOOD_TEST_OVERDUE).toBe("blood_test_overdue");
  });

  it("anchor id derives from the alert key", () => {
    expect(alertAnchorId(ALERT_KEYS.BLOOD_TEST_OVERDUE)).toBe("alert-blood_test_overdue");
  });

  it("time-based health alerts bucket quarterly by default", () => {
    expect(ALERT_BUCKET_DAYS[ALERT_KEYS.BLOOD_TEST_OVERDUE]).toBe(90);
    // Same bucket => same signature => stays dismissed.
    expect(timeBucket(ALERT_KEYS.BLOOD_TEST_OVERDUE, 100)).toBe(
      timeBucket(ALERT_KEYS.BLOOD_TEST_OVERDUE, 170),
    );
    // A genuinely worse situation crosses into a new bucket => re-raises.
    expect(timeBucket(ALERT_KEYS.BLOOD_TEST_OVERDUE, 200)).toBe(2);
  });

  it("event-based alerts have no bucket", () => {
    expect(timeBucket(ALERT_KEYS.BREAKAGE_LOGGED, 500)).toBe(0);
  });

  it("signatures are deterministic and change with the facts", () => {
    const a = alertSignature(ALERT_KEYS.BLOOD_TEST_OVERDUE, ["2026-01-01", 1]);
    const b = alertSignature(ALERT_KEYS.BLOOD_TEST_OVERDUE, ["2026-01-01", 1]);
    const c = alertSignature(ALERT_KEYS.BLOOD_TEST_OVERDUE, ["2026-01-01", 2]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(alertSignature(ALERT_KEYS.WASH_RECENT, [null])).toBe("wash_recent|-");
  });
});
