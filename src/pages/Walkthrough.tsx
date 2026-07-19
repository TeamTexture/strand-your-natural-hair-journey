import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  HomeIllustration,
  WashIllustration,
  ProductsIllustration,
  JournalIllustration,
  ProfileIllustration,
} from "@/components/walkthrough/illustrations";

const SLIDES = [
  {
    Illustration: HomeIllustration,
    title: "Home",
    what: "Your daily hair dashboard — alerts, current style, and quick access to everything.",
    why: "Check here first. It tells you what your hair needs today based on your profile.",
  },
  {
    Illustration: WashIllustration,
    title: "Wash Day",
    what: "Log every wash day with products used, scalp feel, and how your hair responded.",
    why: "Your wash day history becomes the data behind every AI recommendation.",
  },
  {
    Illustration: ProductsIllustration,
    title: "Products",
    what: "Scan or upload any product to get an AI compatibility score based on your hair profile.",
    why: "Stop guessing. Know before you buy whether a product works for your specific hair.",
  },
  {
    Illustration: JournalIllustration,
    title: "Style Journal & Mood Boards",
    what: "Document your favourite styles and track your hair journey with photos, notes, and mood boards for inspiration.",
    why: "Progress is easier to see when you have a record. Your style journal shows how far you have come.",
  },
  {
    Illustration: ProfileIllustration,
    title: "Profile & Nutrition",
    what: "Your full clinical profile, blood results, and personalised nutrition plan in one place.",
    why: "Share your profile PDF with your professional at every appointment.",
  },
];

const FLAG = "strand_walkthrough_complete";

const Walkthrough = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo =
    (location.state as { returnTo?: string } | null)?.returnTo ?? "/home";
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const Illustration = slide.Illustration;

  const finish = () => {
    localStorage.setItem(FLAG, "true");
    navigate(returnTo, { replace: true });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex justify-end px-5 pt-4">
        <button
          onClick={finish}
          className="text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground font-body"
        >
          Skip
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start pt-4 px-7 text-center overflow-y-auto">
        <div className="mb-6"><Illustration /></div>
        <h2 className="font-display text-[28px] leading-tight text-foreground mb-3">{slide.title}</h2>
        <p className="text-[16px] font-body leading-relaxed text-foreground/90 max-w-[340px] mb-3">{slide.what}</p>
        <p className="font-body text-[14px] leading-relaxed text-muted-foreground max-w-[340px]">{slide.why}</p>
      </div>

      <div className="flex justify-center gap-1.5 pb-4">
        {SLIDES.map((_, idx) => (
          <span
            key={idx}
            className={cn(
              "size-1.5 rounded-full transition-all",
              idx === i ? "bg-primary w-4" : "bg-primary/30",
            )}
          />
        ))}
      </div>

      <div className="px-7 pb-8">
        {i < SLIDES.length - 1 ? (
          <Button variant="gold" size="pill" onClick={() => setI(i + 1)}>Next →</Button>
        ) : (
          <Button variant="gold" size="pill" onClick={finish}>Enter Strand →</Button>
        )}
      </div>
    </div>
  );
};

export default Walkthrough;
