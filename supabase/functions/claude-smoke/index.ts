// One-shot smoke test for the Phase 2 foundation. Verifies the round-trip:
//   ANTHROPIC_API_KEY → callClaude → STRAND_PERSONA → 5-word Paige-voice reply.
//
// JWT-gated. Used by Paige to verify ANTHROPIC_API_KEY is set correctly in
// Lovable Cloud Secrets (audit PHASE_2_AUDIT.md §8 Step 4) before per-function
// migrations begin. **Deleted at Phase 2 close-out** — see §8 Step 25/29.

import { callClaude } from "../_shared/anthropic-client.ts";
import { STRAND_PERSONA } from "../_shared/strand-persona.ts";
import { FUNCTION_MODEL_MAP } from "../_shared/build-prompt.ts";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { aiErrorResponse } from "../_shared/errors.ts";
import { requireAuthedUser } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const auth = await requireAuthedUser(req);
  if (auth instanceof Response) return auth;

  try {
    const result = await callClaude({
      model: FUNCTION_MODEL_MAP["claude-smoke"],
      systemBlocks: [
        {
          type: "text",
          text: STRAND_PERSONA,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        { role: "user", content: "Reply in exactly 5 words as Paige." },
      ],
      max_tokens: 64,
    });

    return new Response(
      JSON.stringify({ reply: result.text ?? "", usage: result.usage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return aiErrorResponse(err, "claude-smoke");
  }
});
