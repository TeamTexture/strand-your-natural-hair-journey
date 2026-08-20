// GLOBAL AI KILL SWITCH — pure spend protection.
//
// One Lovable Cloud secret, `AI_KILL_SWITCH`, stops every AI-calling edge
// function regardless of per-function provider flags. Read at CALL time (not
// module init) so flipping the secret takes effect on the next invocation
// without needing a redeploy.
//
// Set `AI_KILL_SWITCH=true` to pause. Unset (or anything else) = normal.

import { json } from "./cors.ts";

declare const Deno: { env: { get(key: string): string | undefined } };

export function checkKillSwitch(): Response | null {
  const flag = (Deno.env.get("AI_KILL_SWITCH") ?? "").trim().toLowerCase();
  if (flag === "true") {
    return json(503, {
      error: "AI features are temporarily paused. Try again shortly.",
    });
  }
  return null;
}
