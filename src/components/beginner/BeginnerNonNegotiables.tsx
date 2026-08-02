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
      {/* Content and order taken from the How To Love Your Afro manuscript,
          Chapter 13 "Building your wash day routine" — top cleansing tips
          (tools in the shower, soak first, lather in the palms, at least two
          cleanses), the detangling section (fingers first, then a tool, with
          product in), and the moisture hierarchy (gentle heat, then a cool
          rinse smoothed down with the fingers, sealing second).
          Hard caps: headline ≤8 words, body ≤30 words, why ≤15 words. */}
      <BeginnerSteps
        steps={[
          { text: "Get set up before you start.", detail: "Clips and your detangling brush in the shower. Split your hair into four to six sections.", why: "Sections mean water and product reach every part." },
          { text: "Soak your hair right through.", detail: "Drench it. Keep going until every curl is heavy, dripping and clumped, down to the roots.", why: "Water is the only real moisturiser." },
          { text: "Take as long as it takes.", detail: "Fine or short hair may soak in a minute. Long, dense or coily hair needs several.", why: "A dry patch never gets cleaned or conditioned." },
          { text: "Lather shampoo in your palms.", detail: "A coin-sized amount, rubbed between wet hands, then spread over your hair.", why: "Spreading it beats scrubbing one spot hard." },
          { text: "Wash one: scalp only.", detail: "Massage with your fingertip pads, never your nails. Work section by section.", why: "Nails scratch and inflame the skin hair grows from." },
          { text: "Rinse it fully out.", detail: "Keep rinsing until the water runs clear and your hair no longer feels slippery.", why: "Leftover shampoo keeps working and dries hair out." },
          { text: "Wash two: down the lengths.", detail: "Shampoo again, this time through the hair itself. It lathers easily now.", why: "Two cleanses shift stubborn oil and product build-up." },
          { text: "Rinse, then squeeze gently.", detail: "Press water out with your palms. Never wring or twist.", why: "Wet hair stretches and snaps far more easily." },
          { text: "Add conditioner, keep adding water.", detail: "Work it through in sections, splashing in more water as you go to build slip.", why: "Slip is what stops knots tearing." },
          { text: "Put your TT Heat Hat on.", detail: "Leave it on for 20 to 30 minutes while the conditioner sits.", why: "Gentle warmth carries moisture inside the strand." },
          { text: "Detangle with fingers, then a tool.", detail: "Unpick knots with your fingers first, ends up to roots. Follow with your detangling brush.", why: "Fingers find knots a brush would rip through." },
          { text: "Rinse cool, smoothing downwards.", detail: "Cool, not icy. Stroke each section root to tip with flat fingers as it rinses.", why: "This is what actually seals the moisture in." },
          { text: "Seal on damp hair, then style.", detail: "Leave-in first, then a cream, butter or oil. Style straight after.", why: "Sealing only slows moisture leaving — it never replaces the cool rinse." },
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
