import { ShieldAlert } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import type { SensitivityScope } from "@/lib/sensitivityVocab";

const COPY: Record<SensitivityScope, { title: string; body: string }> = {
  dietary: {
    title: "Any food allergies or intolerances?",
    body: "So meal ideas and your nutrition plan never suggest something you react to. Takes a few taps.",
  },
  topical: {
    title: "Anything that irritates your skin or scalp?",
    body: "So STRAND warns you when an ingredient you react to turns up in a product or a scan.",
  },
};

/**
 * Inline, non-blocking ask. The page renders and stays usable underneath — no
 * modal gate, no dismissal that counts as an answer. "I have none" is an
 * explicit tap inside the sheet.
 */
const SensitivityCaptureCard = ({
  scope,
  onOpen,
  onLater,
}: {
  scope: SensitivityScope;
  onOpen: () => void;
  onLater: () => void;
}) => {
  const copy = COPY[scope];
  return (
    <SurfaceCard tone="gold" className="p-3.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20">
          <ShieldAlert className="size-3.5 text-primary" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] leading-snug">{copy.title}</p>
          <p className="mt-1 font-body text-[12px] leading-relaxed text-muted-foreground">
            {copy.body}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="gold" size="pill" className="flex-1" onClick={onOpen}>
          Tell STRAND
        </Button>
        <Button variant="goldOutline" size="pill" className="flex-1" onClick={onLater}>
          Not now
        </Button>
      </div>
    </SurfaceCard>
  );
};

export default SensitivityCaptureCard;
