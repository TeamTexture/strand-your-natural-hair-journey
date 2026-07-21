import { useNavigate } from "react-router-dom";
import { Droplets, Flower2, HeartPulse, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import {
  HELLO_KLEAN_URL, HELLO_KLEAN_CODE,
  DAYE_URL, DAYE_CODE,
  LOLA_HEALTH_URL, LOLA_HEALTH_CODE,
} from "@/lib/discounts";

interface OfferProps {
  icon: React.ComponentType<{ className?: string }>;
  brand: string;
  tagline: string;
  blurb: string;
  code: string;
  url: string;
  cta: string;
}

const OfferCard = ({ icon: Icon, brand, tagline, blurb, code, url, cta }: OfferProps) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Copied ${code}`);
    } catch {
      toast.error("Couldn't copy — long-press the code to copy manually.");
    }
  };
  return (
    <div className="rounded-[18px] border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="size-11 rounded-[13px] bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Icon className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[16px] leading-tight">{brand}</p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
            {tagline}
          </p>
        </div>
      </div>
      <p className="text-[12.5px] leading-snug font-body text-foreground/85">{blurb}</p>
      <button
        onClick={copy}
        className="w-full rounded-[12px] border border-dashed border-primary/40 bg-background/70 py-2.5 flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors"
      >
        <span className="font-display text-[16px] tracking-wide text-primary">{code}</span>
        <Copy className="size-3.5 text-muted-foreground" />
      </button>
      <Button
        variant="gold"
        size="pill"
        className="w-full gap-1.5"
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
      >
        {cta} <ExternalLink className="size-3.5" />
      </Button>
    </div>
  );
};

const Discounts = () => {
  const navigate = useNavigate();
  return (
    <ScreenLayout>
      <TitleBar title="Discounts & offers" onBack={() => navigate("/profile")} />
      <div className="px-5 pb-10 space-y-4">
        <p className="text-[12.5px] font-body text-foreground/80 leading-relaxed">
          A growing set of partner discounts, unlocked as part of your STRAND membership. Tap a
          code to copy it, then apply it at checkout on the partner's site.
        </p>

        <SectionLabel>Water & wash day</SectionLabel>
        <OfferCard
          icon={Droplets}
          brand="Hello Klean"
          tagline="Shower filter — softens water"
          blurb="A shower filter that reduces mineral load at the tap. Especially helpful if you live in a hard-water area — less build-up on the strand, softer curls between clarifying washes."
          code={HELLO_KLEAN_CODE}
          url={HELLO_KLEAN_URL}
          cta="Shop Hello Klean"
        />

        <SectionLabel>Wellbeing</SectionLabel>
        <OfferCard
          icon={Flower2}
          brand="Daye"
          tagline="Gynae health & period care"
          blurb="Clean-ingredient tampons and diagnostics from a women-led gynae health company. Small everyday choices that support the wider hormonal picture."
          code={DAYE_CODE}
          url={DAYE_URL}
          cta="Shop Daye"
        />
        <OfferCard
          icon={HeartPulse}
          brand="Lola Health"
          tagline="At-home blood testing"
          blurb="Home blood panels for the markers that matter to hair — iron, ferritin, thyroid, vitamin D. Results you can drop straight into your STRAND blood history."
          code={LOLA_HEALTH_CODE}
          url={LOLA_HEALTH_URL}
          cta="Shop Lola Health"
        />

        <p className="text-[10.5px] font-body text-muted-foreground text-center pt-2">
          Discount codes are provided by partners and may change. If a code stops working, let us
          know at info@teamtexture.co.uk.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default Discounts;
