// Regression test for the live hallucination: a member whose recorded style is
// "Afro Mohawk" was told to apply the product "after taking down your knotless
// braids". Contexts below are the real recorded style states of three members.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ungroundedStylePhrases, recordedStyleLabels } from "../_shared/style-grounding.ts";

const mohawk = { currentStyle: { current_hairstyle: "Afro Mohawk", planned_next_style: "Twist-out" } };
const washAndGo = { currentStyle: { current_hairstyle: "Wash and go", planned_next_style: null } };
const knotless = { currentStyle: { current_hairstyle: "Knotless braids", planned_next_style: "Twist-out" } };

const HALLUCINATION =
  "Apply the Team Texture Heat Hat over deep conditioner after taking down your knotless braids.";

Deno.test("rejects an invented style for the Afro Mohawk member", () => {
  assertEquals(ungroundedStylePhrases(HALLUCINATION, mohawk), ["knotless braids", "knotless", "braids"]);
});

Deno.test("accepts the member's own recorded planned style", () => {
  assertEquals(
    ungroundedStylePhrases(
      "Apply the Heat Hat over your deep conditioner before styling your planned twist-out.",
      mohawk,
    ),
    [],
  );
});

Deno.test("rejects braids for the wash-and-go member, accepts her own style", () => {
  assertEquals(ungroundedStylePhrases("Use it before installing box braids.", washAndGo), [
    "box braids",
    "braids",
  ]);
  assertEquals(ungroundedStylePhrases("Use it on wash and go days.", washAndGo), []);
});

Deno.test("accepts knotless braids only for the member who actually wears them", () => {
  assertEquals(ungroundedStylePhrases(HALLUCINATION, knotless), []);
});

Deno.test("wash day surface: any style reference is ungrounded", () => {
  assertEquals(
    ungroundedStylePhrases("Apply before your twist-out.", mohawk, { styleWithheld: true }),
    ["twist-out"],
  );
});

Deno.test("style-free copy passes", () => {
  assertEquals(
    ungroundedStylePhrases(
      "Wear the Heat Hat over your deep conditioner for twenty minutes; warmth lifts cuticle scales so water reaches high porosity strands.",
      mohawk,
    ),
    [],
  );
  assertEquals(recordedStyleLabels(mohawk), ["afro mohawk", "twist-out"]);
});
