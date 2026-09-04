import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  friendlyInvokeError,
  memberSafeMessage,
  readInvokeErrorMessage,
} from "@/lib/invokeError";

/**
 * 2026-09-04 — the discount claim showed "Edge Function returned a non-2xx
 * status code" because nobody read the Response hanging off `error.context`.
 * These tests hold the reader and the never-leak rules.
 */

const httpError = (status: number, body: unknown, json = true) => {
  const raw = json ? JSON.stringify(body) : String(body);
  return {
    name: "FunctionsHttpError",
    message: "Edge Function returned a non-2xx status code",
    context: new Response(raw, { status }),
  };
};

describe("readInvokeErrorMessage", () => {
  it("reads the server's message field", async () => {
    const err = httpError(400, {
      message: "This offer has already been used on your membership, so nothing has changed.",
      code: "already_used",
    });
    expect(await readInvokeErrorMessage(err)).toContain("already been used");
  });

  it("falls back to the error field", async () => {
    const err = httpError(502, { error: "We couldn't reach billing just now." });
    expect(await readInvokeErrorMessage(err)).toBe("We couldn't reach billing just now.");
  });

  it("never returns the SDK's generic sentence", async () => {
    const err = httpError(500, { message: "Edge Function returned a non-2xx status code" });
    expect(await readInvokeErrorMessage(err)).toBeNull();
  });

  it("never returns an HTML error page or a Postgres string", async () => {
    expect(await readInvokeErrorMessage(httpError(502, "<html>bad gateway</html>", false))).toBeNull();
    expect(
      await readInvokeErrorMessage(
        httpError(500, { message: 'relation "consumer_subscriptions" does not exist' }),
      ),
    ).toBeNull();
  });

  it("returns null for a network failure with no Response", async () => {
    expect(
      await readInvokeErrorMessage({ name: "FunctionsFetchError", message: "Failed to fetch" }),
    ).toBeNull();
  });
});

describe("friendlyInvokeError / memberSafeMessage", () => {
  it("uses the written fallback when there is nothing safe to show", async () => {
    const msg = await friendlyInvokeError({ message: "Failed to fetch" }, "Nothing has changed.");
    expect(msg).toBe("Nothing has changed.");
  });

  it("filters the SDK sentence out of an already-thrown Error", () => {
    const msg = memberSafeMessage(
      new Error("Edge Function returned a non-2xx status code"),
      "Nothing has changed.",
    );
    expect(msg).toBe("Nothing has changed.");
  });
});

describe("consumer-retention-offer failure contract", () => {
  const fn = readFileSync("supabase/functions/consumer-retention-offer/index.ts", "utf8");

  it("returns a member-safe message and a code on every failure path", () => {
    expect(fn).toContain("function fail(status: number, code: string, message: string");
    expect(fn).toContain("json(status, { message, code, error: message })");
    // Offer already used, Stripe unreachable, invalid promo.
    expect(fn).toContain("already been used on your membership");
    expect(fn).toContain("promotion_invalid");
    expect(fn).toContain("billing_unreachable");
  });

  it("never returns a raw Stripe or Postgres message", () => {
    expect(fn).not.toContain("error: (e as Error).message");
  });
});
