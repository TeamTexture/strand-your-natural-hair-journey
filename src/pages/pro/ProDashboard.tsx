import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, User2, Tag, Inbox, CreditCard, LogOut, ArrowLeftRight, ShieldCheck, X, AlertCircle } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { useProSubscription } from "@/hooks/useProSubscription";

const Card = ({
  icon: Icon,
  title,
  sub,
  onClick,
  disabled,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  sub: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center gap-3 p-4 rounded-[14px] bg-card border border-border text-left transition-colors hover:border-primary/50 disabled:opacity-60 disabled:cursor-not-allowed"
  >
    <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
      <Icon className="size-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <p className="font-display text-base font-semibold leading-tight">{title}</p>
        {badge && (
          <span className="text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-body">
            {badge}
          </span>
        )}
      </div>
      <p className="text-[12px] text-foreground/70 mt-0.5 leading-snug">{sub}</p>
    </div>
    {!disabled && <ChevronRight className="size-4 text-primary/70 shrink-0" />}
  </button>
);

const ProDashboard = () => {
  const nav = useNavigate();
  const { signOut, user } = useAuth();
  const { isConsumer, isAdmin } = useRoles();

  return (
    <ScreenLayout>
      <TitleBar title="Professional" back={false} />
      <div className="px-5 pb-8 space-y-4">
        <p className="text-sm text-foreground/70 font-body">
          Welcome{user?.email ? `, ${user.email}` : ""}.
        </p>

        <SectionLabel>Your practice</SectionLabel>
        <div className="space-y-2.5">
          <Card
            icon={User2}
            title="Profile"
            sub="Bio, photos, services, contact details."
            onClick={() => nav("/pro/profile")}
          />
          <Card
            icon={Tag}
            title="Offers"
            sub="One-off promotions on your profile."
            onClick={() => nav("/pro/offers")}
          />
        </div>

        <SectionLabel>Clients</SectionLabel>
        <div className="space-y-2.5">
          <Card
            icon={Inbox}
            title="Enquiries"
            sub="Client requests and passport previews."
            disabled
            badge="Coming soon"
          />
          <Card
            icon={CreditCard}
            title="Billing"
            sub="STRAND Pro subscription."
            disabled
            badge="Coming soon"
          />
        </div>

        {(isConsumer || isAdmin) && (
          <>
            <SectionLabel>Switch view</SectionLabel>
            <div className="space-y-1.5">
              {isConsumer && (
                <button
                  onClick={() => nav("/home")}
                  className="w-full flex items-center gap-3 py-3 text-left text-sm font-body text-foreground/80 hover:text-foreground"
                >
                  <ArrowLeftRight className="size-4 text-primary/70" />
                  <span className="flex-1">Consumer app</span>
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => nav("/admin/applications")}
                  className="w-full flex items-center gap-3 py-3 text-left text-sm font-body text-foreground/80 hover:text-foreground"
                >
                  <ShieldCheck className="size-4 text-primary/70" />
                  <span className="flex-1">Admin panel</span>
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </>
        )}

        <div className="pt-6">
          <button
            onClick={async () => { await signOut(); nav("/", { replace: true }); }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </div>
    </ScreenLayout>
  );
};

export default ProDashboard;
