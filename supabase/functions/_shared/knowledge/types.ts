// Shape definitions for the curated knowledge base — per audit
// PHASE_2_AUDIT.md §2. Each topic file under topics/ exports a single
// const of type `Topic`; topics/index.ts registers them and exposes
// selectTopicsForContext().

export type TopicId =
  | "porosity"
  | "hair-architecture"
  | "scalp-conditions"
  | "diagnosed-conditions"
  | "iron-and-shedding"
  | "vits-and-minerals"
  | "thyroid"
  | "hormones-and-life-stage"
  | "wash-day-mechanics"
  | "heat-and-moisture"
  | "protective-styling";

export interface BookRef {
  chapter: number;
  chapter_title: string;
  page_start: number;
  /** Optional — leave undefined when a clean page range can't be determined. */
  page_end?: number;
}

/** Function-kind identifiers that may select a topic. Mirrors the
 *  FunctionKind union in build-prompt.ts but kept here as plain strings
 *  so the knowledge module has no import on build-prompt and stays
 *  cycle-free. */
export type FunctionKind =
  | "ingredient-analysis"
  | "product-analyse"
  | "product-analyse-url"
  | "tool-analyse-url"
  | "wash-day-observation"
  | "heat-treatment-rationale"
  | "nutrition-plan"
  | "blood-ai-summary"
  | "journal-encouragement";

export interface AppliesTo {
  hair?: {
    porosity?: string[];
    density?: string[];
    scalp?: string[];
  };
  health?: {
    life_stage?: string[];
    conditions?: string[];
  };
  blood_markers?: string[];
  function_kinds?: FunctionKind[];
}

export interface Topic {
  id: TopicId;
  title: string;
  /** Paige-voice body, 200–600 words. Sourced from explicit passages in
   *  How To Love Your Afro; see book_refs for citations. Where the book
   *  does not cover a sub-topic explicitly, the body says so and defers
   *  to the user's professional rather than improvising. */
  body: string;
  applies_to: AppliesTo;
  book_refs: BookRef[];
  tags: string[];
}
