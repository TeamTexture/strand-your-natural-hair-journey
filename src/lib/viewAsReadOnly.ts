// ─────────────────────────────────────────────────────────────────────────────
// Admin "View as member" is READ-ONLY, enforced at the network boundary.
//
// While impersonation is active every mutating request is refused before it
// leaves the browser, so nothing can be written to the member's rows AND —
// just as importantly — no action can execute against the SIGNED-IN admin's
// own data (billing, subscriptions, session logs, referral attributions).
//
// Reads stay fully functional: GET/HEAD to the Data API, read-only RPCs and
// read-only edge functions (context decryption, passport decrypt, AI summaries)
// are allowed through so the member's screens render exactly as she sees them.
// ─────────────────────────────────────────────────────────────────────────────

import { toast } from "sonner";
import { isViewingAsUser } from "@/lib/displayedUser";

export class ViewAsReadOnlyError extends Error {
  constructor(what = "This action") {
    super(`${what} is disabled while you're viewing the app as another member.`);
    this.name = "ViewAsReadOnlyError";
  }
}

/** Guard for any explicit action handler. Throws while impersonating. */
export function assertNotViewingAs(what = "This action"): void {
  if (isViewingAsUser()) throw new ViewAsReadOnlyError(what);
}

/** Read-only RPCs that must keep working so member screens still render. */
const READ_ONLY_RPCS = new Set([
  "ad_delivery_for_slot",
  "ad_estimate_reach",
  "ad_offer_reach",
  "admin_list_member_activity",
  "admin_list_member_emails",
  "admin_list_pro_usage",
  "admin_pro_usage_detail",
  "admin_professional_options",
  "admin_role_history",
  "admin_tip_coverage_distribution",
  "admin_treatment_plans",
  "brand_offer_interest_counts",
  "brand_offer_metrics",
  "brand_product_match_index",
  "brand_product_member_counts",
  "brand_public_catalogue",
  "brand_shelf_engagement",
  "brand_shelf_products",
  "brand_tag_options",
  "brand_tags_for",
  "brand_taken_placements",
  "forum_author_info",
  "forum_author_meta",
  "forum_mention_search",
  "has_active_plus_subscription",
  "mention_search_all",
  "passport_treatment_plans",
  "pro_treatment_clients",
  "treatment_assignable_clients",
  "treatment_client_thread",
  "treatment_invitation",
  "treatment_pro_search",
  "treatment_share_detail",
]);

/** Edge functions that only read and are safe to call while impersonating. */
const READ_ONLY_FUNCTIONS = new Set([
  "data-decrypt-context",
  "passport-decrypt",
  "blood-ai-summary",
  "hard-water-lookup",
]);

const DRY_RUN_AI_FUNCTIONS = new Set([
  "ingredient-analysis",
  "meal-ideas",
  "nutrition-plan",
  "wash-day-steps",
  "wash-day-tip",
]);

async function requestBodyText(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
  const body = init?.body;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (input instanceof Request) {
    try { return await input.clone().text(); } catch { return ""; }
  }
  return "";
}

async function isDryRunAiRequest(input: RequestInfo | URL, init?: RequestInit): Promise<boolean> {
  try {
    const raw = await requestBodyText(input, init);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { dryRun?: unknown; impersonatedUserId?: unknown; impersonation?: { targetUserId?: unknown } };
    return parsed.dryRun === true && (
      typeof parsed.impersonatedUserId === "string" ||
      typeof parsed.impersonation?.targetUserId === "string"
    );
  } catch {
    return false;
  }
}

const isBlocked = async (
  url: string,
  method: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ blocked: boolean; what: string }> => {
  const m = method.toUpperCase();
  const safe = m === "GET" || m === "HEAD" || m === "OPTIONS";

  const rest = url.match(/\/rest\/v1\/(rpc\/)?([^?/]+)/);
  if (rest) {
    if (safe) return { blocked: false, what: "" };
    if (rest[1]) {
      const fn = rest[2];
      if (READ_ONLY_RPCS.has(fn)) return { blocked: false, what: "" };
      return { blocked: true, what: "That action" };
    }
    return { blocked: true, what: "Saving" };
  }

  const fnMatch = url.match(/\/functions\/v1\/([^?/]+)/);
  if (fnMatch) {
    if (READ_ONLY_FUNCTIONS.has(fnMatch[1])) return { blocked: false, what: "" };
    if (DRY_RUN_AI_FUNCTIONS.has(fnMatch[1]) && await isDryRunAiRequest(input, init)) {
      return { blocked: false, what: "" };
    }
    return { blocked: true, what: "That action" };
  }

  if (url.includes("/storage/v1/object") && !safe) {
    return { blocked: true, what: "Uploading" };
  }
  return { blocked: false, what: "" };
};

let installed = false;
let warnedAt = 0;

/** Install the interceptor once for the lifetime of the tab. It is inert
 *  whenever impersonation is not active. */
export function installViewAsReadOnlyGuard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isViewingAsUser()) {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const { blocked, what } = await isBlocked(url, method, input, init);
      if (blocked) {
        if (Date.now() - warnedAt > 3000) {
          warnedAt = Date.now();
          toast("You're viewing as another member — this view is read-only.");
        }
        return new Response(
          JSON.stringify({
            error: "read_only_view_as",
            message: `${what} is disabled while you're viewing the app as another member.`,
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
    }
    return original(input as RequestInfo, init);
  };
}
