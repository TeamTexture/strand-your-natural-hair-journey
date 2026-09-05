import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import WhatsAppGlyph from "@/components/home/WhatsAppGlyph";
import { externalLinkProps } from "@/lib/socialLinks";
import { useAuth } from "@/hooks/useAuth";
import { isWhatsAppCardMinimised, setWhatsAppCardMinimised } from "@/lib/whatsappCard";

const WHATSAPP_URL = "https://wa.me/447956790966";
const GREEN = "#25D366";

const WhatsAppHelpCard = () => {
  const { user } = useAuth();
  const [minimised, setMinimised] = useState(false);

  useEffect(() => {
    setMinimised(isWhatsAppCardMinimised(user?.id));
  }, [user?.id]);

  const toggle = (next: boolean) => {
    setMinimised(next);
    setWhatsAppCardMinimised(user?.id, next);
  };

  if (minimised) {
    return (
      <div className="px-5 pb-2">
        <SurfaceCard className="py-2.5">
          <div className="flex items-center gap-2.5">
            <a
              href={WHATSAPP_URL}
              {...externalLinkProps}
              aria-label="Message Paige on WhatsApp"
              className="size-7 shrink-0 rounded-full flex items-center justify-center transition-transform active:scale-95"
              style={{ backgroundColor: GREEN }}
            >
              <WhatsAppGlyph className="size-4 text-white" />
            </a>
            <button
              type="button"
              onClick={() => toggle(false)}
              aria-expanded={false}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
            >
              <span className="card-title-sm font-display text-[13px] leading-snug text-foreground break-words">
                Message Paige on WhatsApp
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div className="px-5 pb-2">
      <SurfaceCard className="py-4 relative">
        <div className="flex items-start gap-3">
          <span
            className="size-[38px] shrink-0 rounded-full flex items-center justify-center"
            style={{ backgroundColor: GREEN }}
          >
            <WhatsAppGlyph className="size-5 text-white" />
          </span>
          <div className="min-w-0 flex-1 pr-6">
            <h2 className="card-title font-display text-[14.5px] leading-tight text-foreground break-words">
              Message Paige on WhatsApp
            </h2>
            <p className="mt-0.5 font-body text-[12.5px] leading-snug text-muted-foreground">
              Drop Paige a WhatsApp
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggle(true)}
            aria-label="Minimise"
            aria-expanded
            className="absolute right-3 top-3 flex size-7 items-center justify-center text-muted-foreground"
          >
            <ChevronUp className="size-4" />
          </button>
        </div>

        <div className="mt-3">
          <div
            className="px-3 py-2.5"
            style={{
              backgroundColor: "#DCF8C6",
              borderRadius: "12px 12px 12px 3px",
            }}
          >
            <p className="font-body text-[13px] leading-snug" style={{ color: "#2C3B24" }}>
              Quick questions, quick replies — message me directly and I'll come back to you.
            </p>
          </div>
          <p
            className="mt-1 text-right font-body text-[11px]"
            style={{ color: "#6B7A5C" }}
          >
            Paige
          </p>
        </div>

        <a
          href={WHATSAPP_URL}
          {...externalLinkProps}
          className="mt-2 flex h-11 w-full items-center justify-center font-body text-[13px] font-semibold uppercase tracking-[0.08em] text-white transition-transform active:scale-[0.99]"
          style={{ backgroundColor: GREEN, borderRadius: 10 }}
        >
          Message Paige
        </a>
      </SurfaceCard>
    </div>
  );
};

export default WhatsAppHelpCard;
