import { MessageCircle } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { externalLinkProps } from "@/lib/socialLinks";

const WHATSAPP_URL = "https://wa.me/447956790966";

const WhatsAppHelpCard = () => (
  <div className="px-5 pb-2">
    <SurfaceCard className="py-4 relative overflow-hidden">
      <div className="flex items-start gap-3">
        <span className="size-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <MessageCircle className="size-5 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[16px] leading-tight text-foreground break-words">
            Need some help? Drop Paige a WhatsApp!
          </h2>
          <p className="mt-1 font-body text-[12px] leading-snug text-muted-foreground">
            Quick questions, quick replies — message Paige directly on WhatsApp.
          </p>
        </div>
      </div>

      <a
        href={WHATSAPP_URL}
        {...externalLinkProps}
        className="mt-3.5 flex h-11 w-full items-center justify-center rounded-pill bg-primary font-body text-[13px] font-semibold uppercase tracking-wide text-primary-foreground transition-transform active:scale-[0.99]"
      >
        Message Paige
      </a>
    </SurfaceCard>
  </div>
);

export default WhatsAppHelpCard;
