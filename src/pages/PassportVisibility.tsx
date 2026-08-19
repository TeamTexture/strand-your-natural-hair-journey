import { useNavigate } from "react-router-dom";
import { Eye, User, Droplet, Package, CalendarDays, Leaf, PenLine, ImageIcon, Target, ListChecks } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMyPassportVisibility } from "@/hooks/usePassportVisibility";
import { smartBack } from "@/lib/smartBack";

// Mirrors the section registry in PassportView (BASE_SECTIONS), with
// plain-language descriptions written for the member, not the professional.
const SECTIONS: Array<{
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  sub: string;
}> = [
  { key: "profile", label: "Profile", icon: User, sub: "Your personal details, health, medications, allergies, supplements, hair, colour history and blood work." },
  { key: "routine", label: "Routine", icon: Droplet, sub: "Your wash days, step by step." },
  { key: "products", label: "Products", icon: Package, sub: "Your shelf, favourites, wishlist and products you've retired." },
  { key: "appointments", label: "Appointments", icon: CalendarDays, sub: "Your upcoming and past salon visits." },
  { key: "nutrition", label: "Nutrition", icon: Leaf, sub: "Your latest food and supplement guidance." },
  { key: "journal", label: "Journal", icon: PenLine, sub: "Your entries, notes, moods and photos." },
  { key: "photos", label: "Photos", icon: ImageIcon, sub: "Your milestone shots, before photos and moodboards." },
  { key: "goals", label: "Goals", icon: Target, sub: "What you're working towards and why." },
  { key: "treatment", label: "Treatment plans", icon: ListChecks, sub: "Plans you've accepted a professional onto." },
];

const PassportVisibility = () => {
  const nav = useNavigate();
  const { loading, isVisible, setSection } = useMyPassportVisibility();

  const toggle = (key: string, next: boolean) => {
    setSection.mutate(
      { section: key, visible: next },
      { onError: () => toast.error("Couldn't save that. Please try again.") },
    );
  };

  return (
    <ScreenLayout>
      <TitleBar title="What professionals see" onBack={() => smartBack(nav, "/profile")} />

      <div className="px-5 pt-1 pb-4">
        <SurfaceCard>
          <p className="text-[13px] font-body leading-relaxed text-foreground/80">
            Choose which parts of your passport a professional can see once you've accepted
            their enquiry. Everything is shown by default — switch off anything you'd rather
            keep private.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => nav("/profile/passport-preview")}
            className="mt-3 h-9 rounded-pill px-4 text-[12px] gap-1.5"
          >
            <Eye className="size-3.5" />
            Preview what they see
          </Button>
        </SurfaceCard>
      </div>

      <SectionLabel>Passport sections</SectionLabel>

      {loading ? (
        <LoadingDot label="Loading your settings…" fullScreen={false} />
      ) : (
        <div className="px-5 pb-10 space-y-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const on = isVisible(s.key);
            return (
              <SurfaceCard key={s.key}>
                <div className="flex items-start gap-3">
                  <div className="size-9 rounded-full bg-primary/12 text-primary flex items-center justify-center shrink-0">
                    <Icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-body font-semibold text-foreground">{s.label}</p>
                    <p className="text-[12px] text-muted-foreground font-body mt-0.5 leading-relaxed">{s.sub}</p>
                  </div>
                  <Switch
                    checked={on}
                    onCheckedChange={(next) => toggle(s.key, next)}
                    aria-label={`Show ${s.label} to professionals`}
                    className="mt-1 shrink-0"
                  />
                </div>
              </SurfaceCard>
            );
          })}

          <p className="text-[11.5px] text-muted-foreground font-body leading-relaxed pt-1">
            Your private notes stay private either way — a professional's own notes about you
            are theirs, and nothing here changes your medical or legal rights over your data.
          </p>
        </div>
      )}
    </ScreenLayout>
  );
};

export default PassportVisibility;
