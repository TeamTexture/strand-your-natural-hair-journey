import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { BeginnerSteps, DoDont, BeginnerReassurance } from "@/components/beginner/BeginnerGuide";

/**
 * Non-negotiable education, rendered in level-4 "dummies guide" form.
 * These always appear at every support level — the other levels render them
 * in prose elsewhere; this is the illustrated, one-action-per-line version.
 */

export const BeginnerDoubleCleanse = () => (
  <>
    <SectionLabel>Washing your hair, step by step</SectionLabel>
    <SurfaceCard tone="gold">
      <p className="text-[12.5px] leading-relaxed text-foreground/85 mb-3">
        You wash twice, every wash day. The first wash cleans your scalp. The
        second wash cleans your hair.
      </p>
      <BeginnerSteps
        steps={[
          { text: "Wet your hair fully with warm water.", detail: "Let the water run through for about 1 minute so every part is soaked. Warm water gently lifts the tiny overlapping scales on the outside of each strand (the cuticle) so water can get inside — and water is the only thing that actually moisturises your hair." },
          { text: "Put a coin-sized amount of shampoo in your palm.", detail: "Rub your hands together first so it spreads evenly. Spreading it first means you clean everywhere instead of scrubbing one spot hard, which is where breakage starts." },
          { text: "Wash 1: massage only your scalp with your fingertip pads.", detail: "Use the soft pads of your fingers, not your nails. Your scalp is skin, and this first wash lifts off oil, sweat and product so the skin your hair grows from stays healthy. Nails scratch and inflame it." },
          { text: "Rinse it all out.", detail: "Keep rinsing until the water runs clear and your hair does not feel slippery. Leftover shampoo keeps working, and that dries your hair out." },
          { text: "Wash 2: shampoo again, this time down the length of your hair.", detail: "The first wash was for your skin. This one cleans the hair itself, and it lathers much better now the surface dirt is gone — so you need less product and less rubbing. Truly clean hair lets conditioner and water in properly." },
          { text: "Rinse, then squeeze out the extra water.", detail: "Squeeze gently. Do not wring or twist. Wet hair stretches and snaps far more easily than dry hair, so how you handle it now decides how much length you keep." },
          { text: "Put conditioner on, and leave it for 20 minutes.", detail: "Conditioner smooths the lifted cuticle back down and fills in the gaps. Use the TT Heat Hat over the top while you wait — gentle warmth keeps the strand relaxed so the conditioner and water travel deep inside instead of sitting on the surface. That is what makes the softness last days, not hours." },
          { text: "Detangle while the conditioner is still in.", detail: "Work in sections, from the ends up towards the roots, with your fingers or a wide-tooth comb. The conditioner makes the strands slippery so knots slide apart instead of tearing." },
          { text: "Rinse the conditioner out with cool water, and smooth as you go.", detail: "Turn the tap to cool — not icy — and let it run down from root to tip for about a minute. Cool water encourages those cuticle scales to lie flat again after the warmth. As the water runs, stroke your hair downwards with the flat of your fingers, section by section: the scales overlap in one direction like roof tiles, and smoothing with the water flow helps them close the right way. Flat, closed scales trap the moisture you just got inside the strand, so your hair stays soft and shiny for days. It should feel slippery, not squeaky — and never rub or scrunch upwards, that lifts the scales back up." },
          { text: "Seal while your hair is still damp, then style.", detail: "Put your leave-in on first, then an oil, cream or butter on top. Damp hair still holds the water you just added; sealing now keeps it in. Sealing dry hair only coats the outside and there is nothing left inside to hold." },
        ]}
      />

      <DoDont
        className="mt-3"
        dos={[
          "Use your fingertip pads",
          "Wash twice, every time",
          "Detangle while conditioner is in",
        ]}
        donts={[
          "Scratch with your nails",
          "Skip the second wash",
          "Comb dry, bare hair",
        ]}
      />
      <BeginnerReassurance />
    </SurfaceCard>
  </>
);

export const BeginnerTrimEducation = () => (
  <>
    <SectionLabel>Trims and growing your length</SectionLabel>
    <SurfaceCard>
      <BeginnerSteps
        steps={[
          {
            text: "Keep your ends tidy with a small, regular trim.",
            detail: "A good starting rhythm is a light trim every three to four months, and sooner if your ends feel rough, tangle a lot or look split. Your STRAND professional will tell you what is right for your ends.",
          },
          {
            text: "Check your ends each wash day.",
            detail: "Rough, knotty or see-through ends mean it is time for a trim, whatever the calendar says.",
          },
          {
            text: "Trimming does not make your hair grow faster — it helps you keep the length you grow.",
            detail: "Growth happens at your scalp. A damaged end keeps splitting further up the strand, so taking it off stops that travelling.",
          },
          {
            text: "The hair you can see is not alive.",
            detail: "Once a strand leaves your scalp it cannot repair itself. Looking after it is about keeping it, not healing it.",
          },
          {
            text: "If your hair is not getting longer, it is usually breaking, not growing slowly.",
            detail: "Gentle handling, moisture and less tension are what change this.",
          },
        ]}
      />
      <DoDont
        className="mt-3"
        dos={["Trim on a regular rhythm", "Trim sooner if ends feel rough", "Handle wet hair gently"]}
        donts={["Leave split ends for months", "Pull through tangles"]}
      />

    </SurfaceCard>
  </>
);
