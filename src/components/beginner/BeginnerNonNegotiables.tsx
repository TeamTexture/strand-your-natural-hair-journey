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
          { text: "Wet your hair fully with warm water.", detail: "Let the water run through for about 1 minute so every part is soaked." },
          { text: "Put a coin-sized amount of shampoo in your palm.", detail: "Rub your hands together first so it spreads evenly." },
          { text: "Wash 1: massage only your scalp with your fingertip pads.", detail: "Use the soft pads of your fingers, not your nails. This is the wash that lifts dirt and oil off your skin." },
          { text: "Rinse it all out.", detail: "Keep rinsing until the water runs clear and your hair does not feel slippery." },
          { text: "Wash 2: shampoo again, this time down the length of your hair.", detail: "This second wash is the one that cleans the hair itself." },
          { text: "Rinse, then squeeze out the extra water.", detail: "Squeeze gently. Do not wring or twist." },
          { text: "Put conditioner on, and leave it for 20 minutes.", detail: "Use the TT Heat Hat over the top while you wait — the gentle warmth helps it soak in." },
          { text: "Rinse the conditioner out and move on to styling.", detail: "Cool water at the end helps your hair feel smoother." },
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
