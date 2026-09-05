// EVERYTHING IN STRAND — the single feature directory.
//
// Home deliberately shows only a handful of cards, so this is the place every
// feature stays reachable from. It lives inside the existing hamburger sheet
// and is also opened by the "Explore all features" button at the bottom of
// Home. Every row is audited against the real route table in App.tsx — a row is
// only added when the destination renders a working page (routes that need a
// query param or an id to make sense are deliberately not listed here).
//
// Row titles are uppercase + letter-spaced, matching the card-title treatment
// used on Home. Descriptions stay in sentence case. Every row carries a gold
// line icon — no emoji anywhere in this directory.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  ClipboardList,
  Target,
  Repeat,
  Activity,
  Palette,
  Droplets,
  Heart,
  NotebookPen,
  BookOpen,
  Camera,
  LayoutGrid,
  Upload,
  Salad,
  Apple,
  Pill,
  ShieldAlert,
  ScanLine,
  ShoppingBag,
  Bookmark,
  Archive,
  FlaskConical,
  Ban,
  Library,
  Store,
  Microscope,
  Users,
  Calendar,
  CalendarPlus,
  IdCard,
  Eye,
  Inbox,
  MessageCircle,
  Sparkles,
  HelpCircle,
  Mail,
  MessageSquare,
  CalendarDays,
  Ticket,
  Plus,
  CreditCard,
  User,
  Gift,
  Megaphone,
  Compass,
  Scale,
  ArrowLeftRight,
  LogOut,
} from "lucide-react";
import { useActiveTreatmentPlans } from "@/hooks/useTreatmentPlans";

const WHATSAPP_URL = "https://wa.me/447956790966";

interface Feature {
  name: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  /** In-app destination. */
  to?: string;
  /** External destination — always opens in a new tab. */
  href?: string;
  /** Window event dispatched instead of navigating (e.g. the STRAND chat). */
  event?: string;
  /** Named action wired by the host (switch view / sign out). */
  action?: "switch-view" | "sign-out";
}

interface Group {
  label: string;
  items: Feature[];
}

interface DirectoryOptions {
  /** Treatment destination varies with whether a plan is running. */
  treatmentTo: string;
  /** Only offer the view switcher when the account genuinely has another view. */
  canSwitchView?: boolean;
}

/** Grouped feature list — every member-reachable page in the app. */
export function featureGroups({ treatmentTo, canSwitchView }: DirectoryOptions): Group[] {
  const groups: Group[] = [
    {
      label: "My hair",
      items: [
        { name: "Treatment plan", desc: "Your plan, steps and check-ins", icon: ClipboardList, to: treatmentTo },
        { name: "Goals & challenges", desc: "Your goals, challenges and progress", icon: Target, to: "/profile/milestones" },
        { name: "Style & rotation", desc: "Set your current style and plan the next", icon: Repeat, to: "/home/style" },
        { name: "Hair profile", desc: "Your Afro and textured hair details", icon: Activity, to: "/profile/hair" },
        { name: "Colour & chemical history", desc: "Colour, relaxer and styling history", icon: Palette, to: "/profile/colour" },
        { name: "Wash day log & history", desc: "Log a wash day and look back at past ones", icon: Droplets, to: "/wash-day" },
        { name: "Log a wash day", desc: "Walk through today's wash step by step", icon: Droplets, to: "/wash/log" },
        { name: "Wash day favourites", desc: "Routines you save and reuse", icon: Heart, to: "/wash/favourites" },
        { name: "Daily log", desc: "Quick notes between wash days", icon: NotebookPen, to: "/daily-log" },
        { name: "Style journal", desc: "Document your styles over time", icon: BookOpen, to: "/journal" },
        { name: "Progress photos", desc: "Your milestone pictures over time", icon: Camera, to: "/profile/milestones" },
        { name: "Moodboards", desc: "Save style inspiration", icon: LayoutGrid, to: "/journal/moodboards" },
      ],
    },
    {
      label: "My health",
      items: [
        { name: "Blood work", desc: "Your markers and what they mean", icon: Activity, to: "/blood-history" },
        { name: "Add a blood test", desc: "Upload results you already have", icon: Upload, to: "/blood-upload?next=analysis" },
        { name: "Nutrition plan", desc: "Food guidance built around your results", icon: Salad, to: "/nutrition-plan" },
        { name: "Diet & lifestyle", desc: "How you eat, sleep and live", icon: Apple, to: "/profile/health" },
        { name: "Supplements & medications", desc: "What you take, and what it does for hair", icon: Pill, to: "/profile/health" },
        { name: "Allergies & sensitivities", desc: "Things to keep off your hair and scalp", icon: ShieldAlert, to: "/profile/health" },
      ],
    },
    {
      label: "My products",
      items: [
        { name: "Scan a product", desc: "Read a label and get your fit", icon: ScanLine, to: "/products" },
        { name: "My shelf", desc: "Everything you own, analysed for you", icon: ShoppingBag, to: "/products" },
        { name: "Favourites", desc: "The ones that work for you", icon: Heart, to: "/products/favourites" },
        { name: "Wishlist", desc: "Products you are thinking about", icon: Bookmark, to: "/products/wishlist" },
        { name: "Off the shelf", desc: "Products you have retired", icon: Archive, to: "/products/off-shelf" },
        { name: "Homemade products", desc: "Your own mixes, analysed from the recipe", icon: FlaskConical, to: "/products/homemade/new" },
        { name: "Avoid list", desc: "Ingredients you would rather not use", icon: Ban, to: "/products/avoidlist" },
        { name: "Product library", desc: "Browse products other members hold", icon: Library, to: "/products/repository" },
        { name: "Brand directory", desc: "Explore the brands on STRAND", icon: Store, to: "/brands" },
        { name: "Ingredient research", desc: "Look up an ingredient", icon: Microscope, to: "/products/ingredient-research" },
      ],
    },
    {
      label: "Support",
      items: [
        { name: "Find a professional", desc: "Trusted specialists near you", icon: Users, to: "/directory" },
        { name: "Appointments", desc: "Book, log and review appointments", icon: Calendar, to: "/appointments" },
        { name: "Log an appointment", desc: "Record one you have already had", icon: CalendarPlus, to: "/appointments/log" },
        { name: "Client passport", desc: "The summary a professional sees", icon: IdCard, to: "/profile/passport-preview" },
        { name: "What professionals see", desc: "Choose which sections you share", icon: Eye, to: "/profile/passport-visibility" },
        { name: "My enquiries", desc: "Requests you have sent to professionals", icon: Inbox, to: "/profile/enquiries" },
        { name: "Message Paige on WhatsApp", desc: "A direct line for anything urgent", icon: MessageCircle, href: WHATSAPP_URL },
        { name: "Speak to STRAND", desc: "Ask a question and get an answer here", icon: Sparkles, event: "strand:open-chat-widget" },
        { name: "Help", desc: "How STRAND works", icon: HelpCircle, to: "/help" },
        { name: "Contact us", desc: "Send us a message", icon: Mail, to: "/contact" },
      ],
    },
    {
      label: "STRAND+",
      items: [
        { name: "Community forum", desc: "Talk to other members", icon: MessageSquare, to: "/forum" },
        { name: "Start a discussion", desc: "Ask the community something", icon: NotebookPen, to: "/forum/new" },
        { name: "STRAND+ library", desc: "Guides, reads and collections", icon: Library, to: "/plus/library" },
        { name: "STRAND+ events", desc: "What is coming up", icon: CalendarDays, to: "/plus/events" },
        { name: "My tickets", desc: "Events you have booked", icon: Ticket, to: "/plus/tickets" },
        { name: "Messages", desc: "Your conversations on STRAND", icon: MessageCircle, to: "/messages" },
        { name: "Upgrade to STRAND+", desc: "What is included and what it costs", icon: Plus, to: "/plus/upgrade" },
      ],
    },
    {
      label: "Account",
      items: [
        { name: "Membership & billing", desc: "Pause, resume or manage payment", icon: CreditCard, to: "/profile/data-access" },
        { name: "Profile & settings", desc: "Your account in one place", icon: User, to: "/profile" },
        { name: "Personal details", desc: "Name, age, postcode and photo", icon: User, to: "/profile/personal" },
        { name: "Discounts & offers", desc: "Member-only perks", icon: Gift, to: "/profile/discounts" },
        { name: "Personalised offers", desc: "Choose what brands may send you", icon: Megaphone, to: "/profile/personalised-offers" },
        { name: "Email preferences", desc: "What lands in your inbox", icon: Mail, to: "/email-preferences" },
        { name: "App tour", desc: "A quick walk through STRAND", icon: Compass, to: "/walkthrough" },
        { name: "Terms & privacy", desc: "Legal documents and disclaimers", icon: Scale, to: "/legal/terms" },
        { name: "Raise a data concern", desc: "Tell us about a data protection issue", icon: ShieldAlert, to: "/data-protection-complaint" },
        ...(canSwitchView
          ? [
              {
                name: "Switch view",
                desc: "Move between your accounts",
                icon: ArrowLeftRight,
                action: "switch-view" as const,
              },
            ]
          : []),
        { name: "Sign out", desc: "Leave your account on this device", icon: LogOut, action: "sign-out" },
      ],
    },
  ];
  return groups;
}

const FeatureDirectory = ({
  onNavigate,
  onSignOut,
  onSwitchView,
}: {
  onNavigate?: () => void;
  onSignOut?: () => void;
  onSwitchView?: () => void;
}) => {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { bundles } = useActiveTreatmentPlans();
  const treatmentTo = bundles?.[0]?.plan?.id ? `/treatment/${bundles[0].plan.id}` : "/treatment/new";

  const groups = useMemo(() => {
    const all = featureGroups({ treatmentTo, canSwitchView: !!onSwitchView });
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (i) =>
            i.name.toLowerCase().includes(term) || i.desc.toLowerCase().includes(term),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [q, treatmentTo, onSwitchView]);

  const select = (i: Feature) => {
    if (i.action === "sign-out") {
      onSignOut?.();
      return;
    }
    if (i.action === "switch-view") {
      onNavigate?.();
      onSwitchView?.();
      return;
    }
    if (i.href) {
      window.open(i.href, "_blank", "noopener,noreferrer");
      onNavigate?.();
      return;
    }
    if (i.event) {
      onNavigate?.();
      window.dispatchEvent(new Event(i.event));
      return;
    }
    if (i.to) {
      onNavigate?.();
      navigate(i.to);
    }
  };

  return (
    <div>
      <div className="px-5 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search features"
            aria-label="Search features"
            className="w-full h-9 pl-8 pr-3 rounded-[10px] border border-border bg-card text-[13px] font-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
          />
        </div>
      </div>

      {groups.length === 0 && (
        <p className="px-5 py-4 text-[12px] font-body text-muted-foreground">
          Nothing matches that.
        </p>
      )}

      {groups.map((g) => (
        <div key={g.label} className="pb-2">
          <p className="px-5 pt-2 pb-1.5 text-[10px] uppercase tracking-[0.2em] text-primary font-body font-medium">
            {g.label}
          </p>
          {g.items.map((i, idx) => {
            const Icon = i.icon;
            return (
              <button
                key={`${g.label}-${i.name}`}
                onClick={() => select(i)}
                className={`w-full text-left px-5 py-2.5 flex items-start gap-3 hover:bg-primary/[0.05] transition-colors ${
                  idx > 0 ? "border-t border-border/50" : ""
                }`}
              >
                <Icon className="size-4 shrink-0 mt-0.5 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-body font-semibold uppercase tracking-[0.08em] text-foreground leading-snug break-words">
                    {i.name}
                  </span>
                  <span className="block text-[12px] font-body text-muted-foreground leading-snug break-words mt-0.5">
                    {i.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default FeatureDirectory;
