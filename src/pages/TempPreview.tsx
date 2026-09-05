import { Button } from "@/components/ui/button";
import SurfaceCard from "@/components/SurfaceCard";
import WhatsAppGlyph from "@/components/home/WhatsAppGlyph";
import { externalLinkProps } from "@/lib/socialLinks";
import WhatsAppHelpCard from "@/components/home/WhatsAppHelpCard";

const GREEN = "#25D366";

const TempPreview = () => (
  <div className="min-h-screen bg-background py-6">
    <WhatsAppHelpCard />

    <div className="px-5 pb-2 pt-2">
      <SurfaceCard className="py-2.5">
        <div className="flex items-center gap-2.5">
          <a
            href="https://wa.me/447956790966"
            {...externalLinkProps}
            className="size-7 shrink-0 rounded-full flex items-center justify-center"
            style={{ backgroundColor: GREEN }}
          >
            <WhatsAppGlyph className="size-4 text-white" />
          </a>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="font-body text-[13px] text-foreground">Message Paige on WhatsApp</span>
            <span className="text-muted-foreground">v</span>
          </div>
        </div>
      </SurfaceCard>
    </div>

    <div className="px-5 pb-5 space-y-3 pt-4">
      <Button variant="gold" size="pill">+ Log Today's Wash Day</Button>
      <Button
        variant="outline"
        size="pill"
        className="border-[0.5px] border-primary bg-transparent text-primary font-body text-[13px] font-semibold uppercase tracking-[0.08em]"
      >
        Wash Day Favourites
      </Button>
    </div>
  </div>
);

export default TempPreview;
