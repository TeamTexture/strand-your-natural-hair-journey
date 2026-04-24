import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Smartphone,
  Mail,
  MessageCircle,
  ChevronRight,
  Shield,
  BookOpen,
  Heart,
  FileText,
  AlertTriangle,
  Star,
  ExternalLink,
} from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";

interface Retailer {
  name: string;
  region: string;
  url: string;
}

// "How To Love Your Afro" — Paige Lewin (ISBN 9781526686985)
const BOOK_RETAILERS: Retailer[] = [
  {
    name: "Amazon UK",
    region: "United Kingdom",
    url: "https://www.amazon.co.uk/How-Love-Your-Afro-Companion/dp/1526686988",
  },
  {
    name: "Amazon US",
    region: "United States",
    url: "https://www.amazon.com/How-Love-Your-Afro-Self-Love/dp/1526686988",
  },
  {
    name: "Waterstones",
    region: "United Kingdom",
    url: "https://www.waterstones.com/books/search/term/9781526686985",
  },
  {
    name: "Barnes & Noble",
    region: "United States",
    url: "https://www.barnesandnoble.com/s/9781526686985",
  },
  {
    name: "Roving Heights",
    region: "Nigeria",
    url: "https://rhbooks.com.ng/?s=how+to+love+your+afro&post_type=product",
  },
];

const ABOUT_LINKS = [
  { label: "Author site", url: "https://www.paigelewin.co.uk" },
  { label: "Texture Talks", url: "https://www.texturetalks.co.uk" },
  { label: "Book home page", url: "http://www.howtoloveyourafro.com" },
];

interface ActionItem {
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

  const setupItems: ActionItem[] = [
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
  ];

  const contactItems: ActionItem[] = [
    {
      key: "contact-form",
      icon: <MessageCircle className="size-5" />,
      title: "Contact us",
      body: "Send us a message via the in-app form — we reply within 1 working day.",
      action: () => navigate("/contact"),
      cta: "Open form",
    },
    {
      key: "email",
      icon: <Mail className="size-5" />,
      title: "Email us directly",
      body: "Prefer email? Reach the team straight from your inbox.",
      action: () => {
        window.location.href =
          "mailto:info@teamtexture.co.uk?subject=STRAND%20support";
      },
      cta: "info@teamtexture.co.uk",
    },
    {
      key: "report",
      icon: <AlertTriangle className="size-5" />,
      title: "Report a problem",
      body: "Bug, broken page, or wrong information? Send a quick note.",
      action: () =>
        navigate("/contact?subject=" + encodeURIComponent("STRAND bug report")),
      cta: "Report",
    },
  ];

  const policyItems: ActionItem[] = [
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
    {
      key: "terms",
      icon: <FileText className="size-5" />,
      title: "Terms of use",
      body: "How STRAND can be used, including our medical disclaimer.",
      action: () => {
        window.open("https://strand.app/terms", "_blank", "noopener,noreferrer");
      },
      cta: "Read terms",
    },
    {
      key: "rate",
      icon: <Star className="size-5" />,
      title: "Rate STRAND",
      body: "If STRAND is helping you, a quick review goes a long way.",
      action: () => {
        window.location.href = "mailto:hello@strand.app?subject=STRAND%20review";
      },
      cta: "Leave a review",
    },
  ];

  const renderActionList = (items: ActionItem[]) => (
    <div className="px-5 pb-2 space-y-2">
      {items.map((it) => (
        <button key={it.key} onClick={it.action} className="w-full text-left">
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
  );

  return (
    <ScreenLayout bottomNav>
      <TitleBar title="Help & Support" back />

      <div className="px-5 pt-1 pb-3">
        <p className="font-body text-sm text-muted-foreground leading-snug">
          Quick answers, the book that started it all, and ways to reach us.
        </p>
      </div>

      {/* About STRAND */}
      <SectionLabel>About STRAND</SectionLabel>
      <div className="px-5 pb-3">
        <SurfaceCard>
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Heart className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">
                Built on the teachings of How To Love Your Afro
              </p>
              <p className="text-[12px] text-foreground/75 mt-1.5 leading-relaxed">
                STRAND is the companion app to{" "}
                <span className="font-semibold text-foreground">
                  How To Love Your Afro
                </span>{" "}
                by Paige Lewin — host of the Texture Talks Podcast. Every routine,
                ingredient principle and clinical marker in the app is grounded in the
                book&apos;s framework: treat your hair as a record, work with your
                texture, and use real data instead of guesswork.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ABOUT_LINKS.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.15em] text-primary font-medium px-2.5 py-1.5 rounded-full border border-primary/30 hover:bg-primary/10 transition-colors"
                  >
                    {l.label} <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>
      </div>

      {/* Buy the book */}
      <SectionLabel>Buy the book</SectionLabel>
      <div className="px-5 pb-3">
        <SurfaceCard>
          <div className="flex items-start gap-3 mb-3">
            <div className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <BookOpen className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">
                How To Love Your Afro
              </p>
              <p className="text-[11px] uppercase tracking-[0.15em] text-primary font-medium mt-0.5">
                By Paige Lewin
              </p>
            </div>
          </div>

          <p className="text-[12px] text-foreground/75 leading-relaxed">
            <span className="font-semibold text-foreground">What you will learn:</span>{" "}
            how to read your own hair (porosity, density, elasticity), build a wash-day
            routine that fits your texture, decode product ingredients, work with —
            not against — your scalp, and use blood markers and clinical signs to
            understand growth, shedding and breakage. A holistic, data-led guide to
            natural hair and self-love from a Black-British perspective.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2">
            {BOOK_RETAILERS.map((r) => (
              <a
                key={r.name}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-[10px] border border-border bg-background hover:border-primary/50 hover:bg-primary/5 transition-colors min-h-[48px]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {r.region}
                  </p>
                </div>
                <ExternalLink className="size-4 text-primary shrink-0" />
              </a>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground mt-3 leading-snug">
            Links open in your browser. STRAND does not earn a commission on book sales.
          </p>
        </SurfaceCard>
      </div>

      <SectionLabel>Get set up</SectionLabel>
      {renderActionList(setupItems)}

      <SectionLabel>FAQs</SectionLabel>
      <div className="px-5 pb-3 space-y-2">
        {[
          {
            q: "Is STRAND a substitute for medical advice?",
            a: "No. STRAND is a hair journal and tracker. Always speak to a GP, trichologist or dermatologist for medical concerns.",
          },
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
          {
            q: "Do you sell my data?",
            a: "Never. STRAND does not sell or share personal data with third parties. See our Privacy Policy for the full details.",
          },
          {
            q: "How do I delete my account?",
            a: "Email hello@strand.app from your account address and we will erase your data within 30 days.",
          },
        ].map(({ q, a }) => (
          <SurfaceCard key={q}>
            <p className="text-sm font-semibold leading-tight">{q}</p>
            <p className="text-[12px] text-foreground/70 mt-1 leading-snug">{a}</p>
          </SurfaceCard>
        ))}
      </div>

      <SectionLabel>Contact us</SectionLabel>
      {renderActionList(contactItems)}

      <SectionLabel>Policies</SectionLabel>
      {renderActionList(policyItems)}

      <div className="px-5 pt-2 pb-8">
        <p className="text-[10px] text-muted-foreground text-center leading-snug">
          STRAND v1.0 · Made with care in London
        </p>
      </div>
    </ScreenLayout>
  );
};

export default Help;
