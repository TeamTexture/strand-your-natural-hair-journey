import { Link } from "react-router-dom";
import { Camera, ClipboardCheck, ListChecks, Sparkles } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import SectionHeader from "@/components/nav/SectionHeader";
import { Button } from "@/components/ui/button";

/**
 * What a Basic member sees where the Today card would sit. Treatment plans are
 * STRAND+ for every client, with no exception — including plans a professional
 * or STRAND has put together for them.
 */
const POINTS = [
  { icon: ListChecks, text: "A daily schedule you tick off in one tap" },
  { icon: ClipboardCheck, text: "A weekly check-in that tracks how it's going" },
  { icon: Camera, text: "Photos, clips and voice notes kept week by week" },
];

const TreatmentPlusUpsell = ({ next = "/home" }: { next?: string }) => (
  <div className="space-y-2">
    <SectionHeader icon={Sparkles}>Treatment plans</SectionHeader>
    <SurfaceCard tone="gold" className="space-y-3">
      <div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/12 border border-primary/25">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-[9px] font-body font-bold uppercase tracking-[0.2em] text-primary">
            STRAND+
          </span>
        </span>
        <h3 className="font-display text-[18px] leading-tight mt-2">
          Follow a treatment properly, week by week.
        </h3>
        <p className="font-body text-[13px] text-foreground/75 leading-snug mt-1">
          A plan you can actually keep to — yours, or one built for you by your professional or by
          STRAND.
        </p>
      </div>

      <ul className="space-y-1.5">
        {POINTS.map((p) => {
          const Icon = p.icon;
          return (
            <li key={p.text} className="flex items-start gap-2.5">
              <span className="size-7 rounded-full bg-primary/12 text-primary flex items-center justify-center shrink-0">
                <Icon className="size-3.5" />
              </span>
              <span className="font-body text-[13px] leading-snug pt-1">{p.text}</span>
            </li>
          );
        })}
      </ul>

      <Link to={`/plus/upgrade?next=${encodeURIComponent(next)}`} className="block">
        <Button variant="gold" size="pill" className="w-full">
          Upgrade to STRAND+ — £14.99/mo
        </Button>
      </Link>
      <p className="font-body text-[11px] text-center text-foreground/55">
        Pro-rated on upgrade. Cancel any time.
      </p>
    </SurfaceCard>
  </div>
);

export default TreatmentPlusUpsell;
