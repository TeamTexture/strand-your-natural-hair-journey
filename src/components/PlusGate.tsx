import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Sparkles, Users, BookOpen, Calendar, MessageCircle, ArrowRight } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import SurfaceCard from "@/components/SurfaceCard";
import { usePlusAccess } from "@/hooks/usePlusAccess";

const FEATURES = [
  { icon: Users, title: "Community forum", body: "A Reddit-style space for members only." },
  { icon: MessageCircle, title: "Member chat", body: "Message any + member directly." },
  { icon: BookOpen, title: "Courses & ebooks", body: "The STRAND library — grow with every wash." },
  { icon: Calendar, title: "Members-only events", body: "Digital and in-person, RSVP inside the app." },
];

interface Props { children: ReactNode; title?: string }

const PlusGate = ({ children, title = "STRAND+" }: Props) => {
  const { hasPlus, isLoading } = usePlusAccess();
  const location = useLocation();
  if (isLoading) return <LoadingDot />;
  if (hasPlus) return <>{children}</>;
  const next = encodeURIComponent(location.pathname + location.search);
  return (
    <ScreenLayout>
      <TitleBar title={title} />
      <div className="px-5 pb-10 space-y-5">
        <div className="text-center pt-1 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/25">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-body font-bold uppercase tracking-[0.22em] text-primary">
              STRAND+ membership
            </span>
          </div>
          <h1 className="font-display text-[26px] font-semibold leading-tight text-foreground">
            This space is for <span className="italic text-primary">STRAND+</span> members.
          </h1>
          <p className="font-body text-[13px] text-foreground/70 leading-relaxed max-w-[300px] mx-auto">
            The community, the library, the events — everything that turns STRAND
            from a companion into a circle.
          </p>
        </div>

        <SurfaceCard className="!p-0 overflow-hidden">
          <ul className="divide-y divide-border">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.title} className="flex items-start gap-3 p-4">
                  <div className="size-9 rounded-full bg-primary/12 text-primary flex items-center justify-center shrink-0">
                    <Icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-[13.5px] font-semibold text-foreground">{f.title}</p>
                    <p className="font-body text-[12px] text-foreground/70 leading-snug mt-0.5">{f.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </SurfaceCard>

        <Link to={`/plus/upgrade?next=${next}`} className="block">
          <Button variant="gold" size="pill" className="w-full">
            <span className="inline-flex items-center gap-2">
              Upgrade to STRAND+ — £14.99/mo <ArrowRight className="size-4" />
            </span>
          </Button>
        </Link>
        <p className="text-[11px] text-center text-foreground/55 font-body">
          Pro-rated on upgrade. Cancel any time.
        </p>
      </div>
    </ScreenLayout>
  );
};

export default PlusGate;
