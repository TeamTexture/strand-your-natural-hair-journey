// GROUNDING ACCEPTANCE HARNESS — admin only.
//
// Runs the real four-stage pipeline end to end for a given member situation and
// returns everything the author needs to audit it: the coverage classification
// and its justification, the governing principle, the evidence set with chapter
// and page, the generated copy, the claims the verifier rejected, and the claims
// admitted as externally sourced (supplement mode only).
//
// It writes nothing to the tip tables — this is a read-only inspection tool.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireAuthedUser } from "../_shared/auth.ts";
import {
  gatherEvidence,
  mapClaimsToEvidence,
  renderEvidenceBlock,
} from "../_shared/evidence.ts";
import { loadLexicon, terminologyBlock, explainTerminology } from "../_shared/terminology.ts";
import type { SurfaceKey } from "../_shared/chapter-context.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const WRITER_SYSTEM =
  `You are writing one short piece of hair care guidance for one member of an app, in a warm, direct second person. Two sentences maximum. It must contain a specific action she can take and the reason it matters to her. Never mention a book, author, chapter or page. Reply with JSON only: {"tip":"..."}`;

const DEFAULT_TESTS: Array<{ name: string; surface: SurfaceKey; memberContext: string; question: string }> = [
  {
    name: "1. Glycerin and porosity",
    surface: "ingredient-profile",
    memberContext:
      "Type 4C hair, high porosity, medium density, normal scalp. Goal: retain length. Currently wearing cornrows. Asking about glycerin in her leave-in.",
    question: "What does glycerin do for her hair, and what should she do about it?",
  },
  {
    name: "2. Conditioning shampoo sequence",
    surface: "wash-day-tip",
    memberContext:
      "Type 4A hair, low porosity, high density, dry scalp. Goal: healthier wash days. Currently wearing loose natural hair. Asking how to sequence cleansing on wash day.",
    question: "How should she cleanse on wash day, and in what order?",
  },
  {
    name: "3. What a leave-in does",
    surface: "brand-product-guidance",
    memberContext:
      "Type 4B hair, normal porosity, low density, normal scalp. Goal: moisture retention. Currently wearing two-strand twists. Asking what a leave-in conditioner actually does.",
    question: "What does a leave-in conditioner do for her, and how should she use it?",
  },
  {
    name: "4. Swimming in a chlorinated pool three times a week",
    surface: "wash-day-tip",
    memberContext:
      "Type 4C hair, high porosity, medium density, normal scalp. Goal: retain length. Currently wearing cornrows. She swims in a chlorinated pool three times a week and asks how to handle her hair around swimming.",
    question: "How should she handle her hair around swimming three times a week in chlorinated water?",
  },
];

async function write(evidenceBlock: string, memberContext: string, question: string) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return { tip: "", tokens: 0 };
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${WRITER_SYSTEM}\n\n${evidenceBlock}` },
        { role: "user", content: `HER RECORDED FACTS:\n${memberContext}\n\nTHE QUESTION: ${question}` },
      ],
    }),
  });
  if (!res.ok) return { tip: "", tokens: 0 };
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  let tip = "";
  try {
    tip = String(JSON.parse(content)?.tip ?? "");
  } catch {
    tip = typeof content === "string" ? content : "";
  }
  return { tip, tokens: Number(json?.usage?.total_tokens ?? 0) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;
  const { user, supabase } = auth;
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "admin only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let tests = DEFAULT_TESTS;
  try {
    const body = await req.json();
    if (Array.isArray(body?.tests) && body.tests.length) tests = body.tests;
  } catch { /* defaults */ }

  const lex = await loadLexicon();
  const results = [];
  for (const t of tests) {
    const set = await gatherEvidence({
      fn: "grounding-acceptance",
      surface: t.surface,
      memberContext: t.memberContext,
    });
    const block = [renderEvidenceBlock(set), terminologyBlock(lex)].filter(Boolean).join("\n\n");
    const { tip } = set.items.length
      ? await write(block, t.memberContext, t.question)
      : { tip: "" };
    const mapping = tip ? await mapClaimsToEvidence(tip, set) : { unmapped: [], external: [], ran: false, tokens: 0 };
    const terminology = explainTerminology(tip, lex);
    results.push({
      name: t.name,
      surface: t.surface,
      coverage: set.coverage,
      coverage_reason: set.coverageReason,
      governing_principle: set.governingPrinciple,
      chapters: set.chapters,
      evidence: set.items.map((i) => ({
        source: i.source ?? "manuscript",
        chapter: i.chapter,
        chapter_title: i.chapter_title,
        page_start: i.page_start,
        page_end: i.page_end,
        passage: i.passage,
        relevance: i.relevance,
      })),
      output: tip,
      unmapped: mapping.unmapped,
      external: mapping.external,
      terminology_violations: terminology,
    });
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
