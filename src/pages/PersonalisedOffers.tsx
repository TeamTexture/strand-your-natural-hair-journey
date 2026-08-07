import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, Ban } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import SurfaceCard from "@/components/SurfaceCard";
import { Switch } from "@/components/ui/switch";
import { smartBack } from "@/lib/smartBack";
import {
  usePersonalisedOffersConsent,
  useSetPersonalisedOffersConsent,
} from "@/hooks/useAdTargeting";

const NEVER_USED = [
  "Blood results, panels and flagged markers",
  "Medications and supplements",
  "Diagnosed conditions, scalp conditions and thinning areas",
  "Pregnancy, age, heritage or postcode",
  "Journal entries, voicenotes and chat messages",
  "Anything about the professionals you see",
];

const MAY_BE_USED = [
  "Porosity, density, strand thickness and surface texture",
  "Hair length band",
  "How often you wash",
  "The kinds of products on your shelf (e.g. leave-ins, masks)",
  "Your current style and planned next style",
  "Your hair goal focus (e.g. length retention)",
];

/** Member control for consent-gated personalised brand offers. Off unless the
 *  member turns it on; turning it off takes effect immediately. */
const PersonalisedOffers = () => {
  const nav = useNavigate();
  const { data: consent, isLoading } = usePersonalisedOffersConsent();
  const setConsent = useSetPersonalisedOffersConsent();

  const toggle = (next: boolean) => {
    setConsent.mutate(next, {
      onSuccess: () =>
        toast.success(next ? "Personalised offers turned on" : "Personalised offers turned off"),
      onError: () => toast.error("Could not save that — try again."),
    });
  };

  return (
    <ScreenLayout>
      <TitleBar title="Personalised offers" onBack={smartBack(nav, "/profile")} />
      <div className="px-5 pb-10 space-y-4">
        <p className="text-[12.5px] font-body text-foreground/80 leading-relaxed">
          Brands pay to show offers inside STRAND. With this switched on, we can show you the ones
          that suit your hair rather than the same banner as everyone else. It is off unless you
          turn it on, and you can turn it off at any time.
        </p>

        <SurfaceCard className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] leading-tight">Show me offers matched to my hair</p>
            <p className="text-[11.5px] font-body text-muted-foreground leading-snug mt-1">
              Brands never see who you are, and never receive your data. They only ever see
              aggregate counts.
            </p>
          </div>
          <Switch
            checked={!!consent}
            disabled={isLoading || setConsent.isPending}
            onCheckedChange={toggle}
            aria-label="Show me offers matched to my hair"
          />
        </SurfaceCard>

        <SectionLabel>What may be used</SectionLabel>
        <SurfaceCard className="space-y-2">
          {MAY_BE_USED.map((line) => (
            <div key={line} className="flex items-start gap-2">
              <ShieldCheck className="size-3.5 text-primary shrink-0 mt-[3px]" />
              <p className="text-[12px] font-body leading-snug">{line}</p>
            </div>
          ))}
        </SurfaceCard>

        <SectionLabel>Never used, ever</SectionLabel>
        <SurfaceCard className="space-y-2">
          {NEVER_USED.map((line) => (
            <div key={line} className="flex items-start gap-2">
              <Ban className="size-3.5 text-muted-foreground shrink-0 mt-[3px]" />
              <p className="text-[12px] font-body leading-snug text-foreground/80">{line}</p>
            </div>
          ))}
        </SurfaceCard>

        <p className="text-[10.5px] font-body text-muted-foreground text-center pt-1 leading-relaxed">
          Every change to this setting is logged with a timestamp. Questions about how your data is
          used? Email info@teamtexture.co.uk.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default PersonalisedOffers;
