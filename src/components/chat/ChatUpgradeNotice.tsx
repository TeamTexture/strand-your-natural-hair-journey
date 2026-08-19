// Inline STRAND+ upsell shown above a locked chat composer. Basic members can
// message a professional up until their first appointment has passed; after
// that, only STRAND+ keeps the conversation open. History stays readable.
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";

interface Props {
  /** Tighter spacing for the in-list preview on the Messages screen. */
  compact?: boolean;
}

const ChatUpgradeNotice = ({ compact = false }: Props) => {
  const location = useLocation();
  const next = encodeURIComponent(location.pathname + location.search);
  return (
    <SurfaceCard
      tone="gold"
      padded={false}
      className={compact ? "p-3 space-y-2" : "p-3.5 space-y-2.5"}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="size-3.5 text-primary mt-0.5 shrink-0" />
        <p className="font-body text-[11.5px] leading-snug text-foreground/80">
          Your first appointment with this professional has passed. Upgrade to{" "}
          <span className="font-semibold text-primary">STRAND+</span> to keep
          chatting — your conversation stays here either way.
        </p>
      </div>
      <Link to={`/plus/upgrade?next=${next}`} className="block">
        <Button variant="gold" size="pill" className="w-full h-9 text-[12px]">
          <span className="inline-flex items-center gap-1.5">
            Upgrade to STRAND+ <ArrowRight className="size-3.5" />
          </span>
        </Button>
      </Link>
    </SurfaceCard>
  );
};

export default ChatUpgradeNotice;
