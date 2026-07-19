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
    key_ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          benefit: { type: "string" },
          flag: { type: "string", enum: ["good", "warn", "avoid"] },
          reason: { type: "string" },
        },
        required: ["name", "benefit", "flag", "reason"],
      },
    },
    match_score: { type: "integer", minimum: 0, maximum: 100 },
    ai_summary: { type: "string" },
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
  required: [
    "product_name",
    "brand",
    "category",
    "ingredients",
    "key_ingredients",
    "match_score",
    "ai_summary",
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
  }>;
  match_score: number;
  ai_summary: string;
  usage_instructions: string;
  use_cases: string[];
  tips: string[];
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
