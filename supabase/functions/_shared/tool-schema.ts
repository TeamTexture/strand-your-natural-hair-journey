// Shared tool-use schema for the tool-analyse-url Claude path.
// Audit PHASE_2_AUDIT.md §5 Step 4b — analogous to RETURN_PRODUCT_ANALYSIS_SCHEMA
// but for hair TOOLS (brushes, dryers, caps, bonnets, etc.) which have NO
// ingredients. The renderer (MyToolsSection.tsx) only consumes a subset
// today; extra fields are forward-compatible.

export const TOOL_KIND_ENUM = [
  "heat_cap",
  "deep_conditioning_cap",
  "hair_dryer",
  "diffuser",
  "blow_dryer",
  "flat_iron",
  "curling_iron",
  "curling_wand",
  "brush",
  "comb",
  "detangler",
  "hooded_dryer",
  "steamer",
  "scalp_massager",
  "microfiber_towel",
  "satin_bonnet",
  "satin_pillowcase",
  "other",
] as const;

export const RETURN_TOOL_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    tool_name: { type: "string" },
    brand: { type: "string" },
    tool_kind: { type: "string", enum: TOOL_KIND_ENUM as unknown as string[] },
    ai_summary: {
      type: "string",
      description:
        "2–3 sentences MAX. Lead with the verdict (good/mixed/poor fit) for THIS user.",
    },
    key_features: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          relevance: {
            type: "string",
            description: "Why this feature matters for THIS user's profile.",
          },
        },
        required: ["name", "relevance"],
      },
    },
    use_cases: {
      type: "array",
      maxItems: 2,
      items: { type: "string" },
    },
    tips: {
      type: "array",
      maxItems: 2,
      items: { type: "string" },
    },
    warnings: {
      type: "array",
      maxItems: 2,
      items: { type: "string" },
    },
    personalisation_rationale: {
      type: "string",
      description:
        "1–2 sentences explaining why this tool does or doesn't suit this specific user's hair profile.",
    },
    match_score: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description:
        "How well this tool fits THIS user's hair profile, goals and current style. 0 = poor fit, 100 = ideal fit. Calibrate honestly — most tools land 40–75.",
    },
    how_to_use: {
      type: "string",
      description:
        "1–3 short sentences on HOW this specific user should use this tool given their hair (technique, section size, heat setting, frequency). Second person, plain English.",
    },
    pair_with: {
      type: "array",
      maxItems: 4,
      description:
        "Up to 4 pairings. Each pairing references EITHER a specific item already on the user's shelf/favourites/tools list (source='shelf'), a specific item already on the user's wishlist (source='wishlist'), or — when nothing suitable exists in the user's data — a generic product type / category the user should look for (source='suggested'). NEVER invent brands the user does not own; suggested entries must be generic (e.g. 'a lightweight water-based leave-in with silk-amino acids'). Every entry must include a personalised 'why' that ties the pairing to THIS user's hair type, goal, or the specific risk of using this tool.",
      items: {
        type: "object",
        properties: {
          item: { type: "string", description: "Real product/tool name if source is 'shelf' or 'wishlist'. Generic product-type description if source is 'suggested'." },
          why: { type: "string", description: "One sentence tying the pairing to THIS user's hair profile, goal, or the tool's risk." },
          source: { type: "string", enum: ["shelf", "wishlist", "suggested"], description: "Where the pairing comes from. Must be accurate — do not label a wishlist item as shelf." },
        },
        required: ["item", "why", "source"],
      },
    },
    routine_suggestion: {
      type: "string",
      description:
        "1–2 short sentences suggesting where this tool slots into the user's routine given their current style, wash-day cadence, and goals. Empty string if nothing meaningful can be said.",
    },
  },
  required: [
    "tool_name",
    "brand",
    "tool_kind",
    "ai_summary",
    "key_features",
    "use_cases",
    "tips",
    "personalisation_rationale",
    "match_score",
    "how_to_use",
  ],
} as const;

export type ToolKind = typeof TOOL_KIND_ENUM[number];

export interface ToolAnalysisPayload {
  tool_name: string;
  brand: string;
  tool_kind: ToolKind;
  ai_summary: string;
  key_features: Array<{ name: string; relevance: string }>;
  use_cases: string[];
  tips: string[];
  warnings?: string[];
  personalisation_rationale: string;
  match_score: number;
  how_to_use: string;
  pair_with?: Array<{ item: string; why: string; source?: "shelf" | "wishlist" | "suggested" }>;
  routine_suggestion?: string;
  // Provenance (added by edge function)
  _model_version?: string;
  _generated_at?: string;
  _provider?: "claude" | "lovable";
  _used_web_search?: boolean;
  _web_search_count?: number;
  _used_web_fetch?: boolean;
  _profile_snapshot_hash?: string;
  _source_image_url?: string;
  image_url?: string;
  // Back-compat fields the existing client reads (Lovable path mirrors these)
  is_tool?: boolean;
  name?: string;
  category?: string;
  summary?: string;
}
