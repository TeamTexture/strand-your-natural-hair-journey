import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Smartphone, Mail, MessageCircle, ChevronRight, Shield } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";

interface HelpItem {
  key: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  action: () => void;
  cta: string;
}

const Help = () => {
  const navigate = useNavigate();

  const isAndroid = useMemo(
    () => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent),
    [],
  );
  const isIos = useMemo(
    () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent),
    [],
  );

  const items: HelpItem[] = [
    {
      key: "install",
      icon: <Smartphone className="size-5" />,
      title: "Add STRAND to your home screen",
      body: isIos
        ? "Open Safari, tap Share, then Add to Home Screen."
        : isAndroid
          ? "Open Chrome, tap the three-dot menu, then Add to Home Screen."
          : "Install STRAND as an app for the fastest experience.",
      action: () => navigate("/setup?from=help"),
      cta: "Show me how",
    },
    {
      key: "email",
      icon: <Mail className="size-5" />,
      title: "Email support",
      body: "Get a response within 1 working day.",
      action: () => {
        window.location.href = "mailto:hello@strand.app?subject=STRAND%20support";
      },
      cta: "hello@strand.app",
    },
    {
      key: "feedback",
      icon: <MessageCircle className="size-5" />,
      title: "Send feedback",
      body: "Tell us what is missing or what we should fix.",
      action: () => {
        window.location.href = "mailto:hello@strand.app?subject=STRAND%20feedback";
      },
      cta: "Open email",
    },
    {
      key: "privacy",
      icon: <Shield className="size-5" />,
      title: "Privacy & data",
      body: "Your hair data, blood markers and photos are private to you.",
      action: () => {
        window.open("https://strand.app/privacy", "_blank", "noopener,noreferrer");
      },
      cta: "Read policy",
    },
  ];

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Help & Support" back />

      <div className="px-5 pt-1 pb-3">
        <p className="font-body text-sm text-muted-foreground leading-snug">
          Quick answers and ways to reach us.
        </p>
      </div>

      <SectionLabel>Get set up</SectionLabel>
      <div className="px-5 pb-2 space-y-2">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={it.action}
            className="w-full text-left"
          >
            <SurfaceCard className="hover:border-primary/50 transition-colors">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  {it.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">{it.title}</p>
                  <p className="text-[12px] text-foreground/70 mt-0.5 leading-snug">
                    {it.body}
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium mt-1.5">
                    {it.cta}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground mt-2 shrink-0" />
              </div>
            </SurfaceCard>
          </button>
        ))}
      </div>

      <SectionLabel>FAQs</SectionLabel>
      <div className="px-5 pb-8 space-y-2">
        {[
          {
            q: "How do I update my hair or blood data?",
            a: "Go to Profile and tap the Edit button on any section, or use the “Update your profile” banner at the top.",
          },
          {
            q: "Where are my photos stored?",
            a: "All product photos, journal entries and avatars are stored privately in your account. Only you can see them.",
          },
          {
            q: "Can I use STRAND offline?",
            a: "Most reading and journal viewing works offline once installed. New uploads sync when you reconnect.",
          },
        ].map(({ q, a }) => (
          <SurfaceCard key={q}>
            <p className="text-sm font-semibold leading-tight">{q}</p>
            <p className="text-[12px] text-foreground/70 mt-1 leading-snug">{a}</p>
          </SurfaceCard>
        ))}
      </div>
    </ScreenLayout>
  );
};

export default Help;
