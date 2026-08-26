// Shared tool-use schemas for Claude-targeted edge functions.
// Audit PHASE_2_AUDIT.md §5 Step 3 + §5 Step 4a — the photo flow
// (`product-analyse`) and the URL flow (`product-analyse-url`) MUST
// produce identical client-side payloads, so the schema lives here and
// both functions import it.
//
// CRITICAL: this schema is the public contract the React renderer
// (`ProductDetailNew.tsx`, `useProductScan.ts`) reads. Adding a field
// is safe; renaming or removing a field is a breaking change that
// requires a coordinated client update.

import {
  SCORE_REASONS_SCHEMA_PROPERTY,
  type ScoreReason,
} from "./score-reasons.ts";
import {
  PURPOSE_INSIGHT_SCHEMA_PROPERTY,
  type PurposeInsight,
} from "./purpose-insight.ts";

/** The structured payload Claude is forced to return for both the photo
 *  and URL product-analysis flows. Mirrors the long-standing Lovable+Gemini
 *  output shape — port verbatim. */
export const RETURN_PRODUCT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    product_name: { type: "string" },
    brand: { type: "string" },
    category: {
      type: "string",
      enum: [
        "shampoo",
        "conditioner",
        "treatment",
        "styler",
        "oil",
        "mask",
        "leave-in",
        "other",
      ],
    },
    ingredients: {
      type: "array",
      items: { type: "string" },
      description:
        "Full INCI list, lowercase, in label order. If the visible label is partial or obscured and web_search resolved the canonical formulation, return the full canonical list — not just what was visible in the photo.",
    },
    // NOTE (speed, 2026-08): key_ingredients deliberately sits AFTER
    // ai_summary in this schema. Claude emits tool JSON in schema order and
    // the response is streamed, so the score, reasons and headline reach the
    // member ~10s earlier when the long per-ingredient block comes last.

    match_score: { type: "integer", minimum: 0, maximum: 100 },
    score_reasons: SCORE_REASONS_SCHEMA_PROPERTY,
    insight: PURPOSE_INSIGHT_SCHEMA_PROPERTY,
    ai_summary: {
      type: "string",
      description:
        "Exactly ONE tight sentence: the overall call and the single user signal driving it. score_reasons carry the why.",
    },
    key_ingredients: {
      type: "array",
      maxItems: 6,
      description:
        "The 4–6 ingredients that actually decide this product for THIS member — the ones driving the score. Never a walk-through of the whole INCI list.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          benefit: { type: "string", description: "What it does, 12 words maximum." },
          flag: { type: "string", enum: ["good", "warn", "avoid"] },
          reason: {
            type: "string",
            description:
              "Why that flag for THIS member, naming the trait it turns on. 20 words maximum, one sentence.",
          },
          surfactant_role: {
            type: "string",
            enum: ["primary", "secondary", "none"],
            description:
              "For cleansing agents only: 'primary' for the main detergent doing the bulk of the cleansing (e.g. sodium lauryl sulfate, sodium laureth sulfate, sodium coco-sulfate, sodium C14-16 olefin sulfonate), 'secondary' for co-surfactants/amphoterics that boost lather and soften the primary (e.g. cocamidopropyl betaine, coco-glucoside, decyl glucoside, sodium cocoamphoacetate). 'none' for every non-surfactant ingredient.",
          },
        },
        required: ["name", "benefit", "flag", "reason"],
      },
    },



    usage_instructions: {
      type: "string",
      description:
        "VERBATIM directions from the manufacturer if visible on the label or resolved via web_search. Empty string if not available — never invent.",
    },
    use_cases: { type: "array", items: { type: "string" } },
    tips: { type: "array", items: { type: "string" } },
    pair_with: {
      type: "array",
      maxItems: 3,
      description:
        "Up to 3 concrete pairings that reference SPECIFIC items already on the user's shelf, favourites, or tools list by name. Each item names the product/tool and briefly says why it complements THIS product for THIS user. If no relevant items are on the shelf, return an empty array — do NOT invent generic pairings.",
      items: {
        type: "object",
        properties: {
          item: { type: "string", description: "Exact name (and brand if known) of a shelf/tool item to pair with." },
          why: { type: "string", description: "One sentence: why this pairing helps THIS user's hair goals or challenges." },
        },
        required: ["item", "why"],
      },
    },
    routine_suggestion: {
      type: "string",
      description:
        "1–2 short sentences suggesting how to slot THIS product into the user's existing routine (wash-day step, frequency, layered before/after which items on their shelf). Empty string if nothing meaningful can be said from the user context.",
    },
  },
  // Order mirrors `properties` so the streamed emission order puts the
  // verdict (score, reasons, headline) ahead of the longer guidance blocks.
  required: [
    "product_name",
    "brand",
    "category",
    "ingredients",
    "match_score",
    "score_reasons",
    "insight",
    "ai_summary",
    "key_ingredients",
    "usage_instructions",
    "use_cases",
    "tips",
  ],

} as const;

/** TypeScript-side mirror of the schema shape. Kept loose (no enums on
 *  string unions) so the runtime tool_use parse drops in cleanly. */
export interface ProductAnalysisPayload {
  product_name: string;
  brand: string;
  category:
    | "shampoo"
    | "conditioner"
    | "treatment"
    | "styler"
    | "oil"
    | "mask"
    | "leave-in"
    | "other";
  ingredients: string[];
  key_ingredients: Array<{
    name: string;
    benefit: string;
    flag: "good" | "warn" | "avoid";
    reason: string;
    surfactant_role?: "primary" | "secondary" | "none";
  }>;
  match_score: number;
  /** Structured "show your working" rows behind match_score. */
  score_reasons?: ScoreReason[];
  /** The ONE purpose-driven insight replacing the old explanatory section. */
  insight?: PurposeInsight;

  ai_summary: string;
  usage_instructions: string;
  use_cases: string[];
  tips: string[];
  pair_with?: Array<{ item: string; why: string }>;
  routine_suggestion?: string;
  // Provenance — added by the edge function, not part of the model output schema.
  _model_version?: string;
  _generated_at?: string;
  _provider?: "claude" | "lovable";
  _used_web_search?: boolean;
  _web_search_count?: number;
  /** Step 4a (URL flow) only — true when Claude invoked the native
   *  web_fetch tool to retrieve the page. Photo flow leaves this undefined. */
  _used_web_fetch?: boolean;
  /** Stable fingerprint of the user's profile at analysis time — used to
   *  decide whether a re-scan should hit the cached row or re-analyse. */
  _profile_snapshot_hash?: string;
  /** og:image extracted from the source page (URL flow). */
  _source_image_url?: string;
  /** Mirror of _source_image_url for the renderer. */
  image_url?: string;
}
