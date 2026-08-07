import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { smartBack } from "@/lib/smartBack";
import { recordConsents, withdrawConsent } from "@/lib/consent";

type PrefKey =
  | "wash_day_reminders"
  | "blood_test_due"
  | "forum_replies"
  | "enquiry_updates"
  | "appointment_reminders"
  | "brand_offers"
  | "marketing_consent";

interface Prefs {
  user_id: string;
  marketing_consent: boolean;
  wash_day_reminders: boolean;
  blood_test_due: boolean;
  forum_replies: boolean;
  enquiry_updates: boolean;
  appointment_reminders: boolean;
  brand_offers: boolean;
}

const OPTIONAL: { key: PrefKey; label: string; help: string }[] = [
  {
    key: "wash_day_reminders",
    label: "Wash day reminders",
    help: "A nudge the day before a wash day you have scheduled.",
  },
  {
    key: "blood_test_due",
    label: "Blood test due",
    help: "When your next test date comes around.",
  },
  {
    key: "enquiry_updates",
    label: "Enquiry replies",
    help: "When a professional replies to an enquiry you sent.",
  },
  {
    key: "appointment_reminders",
    label: "Appointment updates",
    help: "Bookings, reminders and cancellations.",
  },
  {
    key: "forum_replies",
    label: "Forum replies",
    help: "When someone replies to a post of yours.",
  },
];

const ESSENTIAL = [
  "Account confirmation and password changes",
  "Subscription, renewal and payment notices",
  "Application and listing decisions",
  "Moderation decisions about your content",
  "Data protection complaint acknowledgements",
];

const EmailPreferences = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const unsubToken = params.get("unsubscribe");
  const [unsubDone, setUnsubDone] = useState(false);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["email-preferences", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("email_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (data) return data as unknown as Prefs;
      const { data: created, error } = await supabase
        .from("email_preferences")
        .insert({ user_id: user!.id })
        .select("*")
        .single();
      if (error) throw error;
      return created as unknown as Prefs;
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<Record<PrefKey, boolean>>) => {
      const row: Record<string, unknown> = { ...patch };
      if (patch.marketing_consent !== undefined) {
        row.marketing_consent_at = patch.marketing_consent
          ? new Date().toISOString()
          : null;
      }
      const { error } = await supabase
        .from("email_preferences")
        .update(row as never)
        .eq("user_id", user!.id);
      if (error) throw error;
      // Append-only consent ledger — a withdrawal writes a new granted=false row.
      if (patch.marketing_consent !== undefined) {
        if (patch.marketing_consent) await recordConsents({ marketing_email: true });
        else await withdrawConsent("marketing_email");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-preferences", user?.id] });
    },
    onError: () => toast.error("Could not save that. Try again."),
  });

  // One-click unsubscribe from a marketing email footer.
  useEffect(() => {
    if (!unsubToken || !user || unsubDone || !prefs) return;
    (async () => {
      const { error } = await supabase
        .from("email_preferences")
        .update({ marketing_consent: false, marketing_consent_at: null })
        .eq("user_id", user.id);
      setUnsubDone(true);
      if (!error) {
        toast.success("You are unsubscribed from STRAND updates.");
        qc.invalidateQueries({ queryKey: ["email-preferences", user.id] });
      }
    })();
  }, [unsubToken, user, unsubDone, prefs, qc]);

  if (isLoading || !prefs) return <LoadingDot />;

  const toggle = (key: PrefKey) => (v: boolean) => save.mutate({ [key]: v });

  return (
    <ScreenLayout>
      <TitleBar title="Email preferences" onBack={smartBack(nav, "/profile")} />

      <div className="px-5 pb-8 space-y-4">
        <SectionLabel>Optional notifications</SectionLabel>
        <SurfaceCard className="divide-y divide-border">
          {OPTIONAL.map((o) => (
            <div key={o.key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-medium">{o.label}</p>
                <p className="font-body text-xs text-muted-foreground mt-0.5">
                  {o.help}
                </p>
              </div>
              <Switch
                checked={prefs[o.key as keyof Prefs] === true}
                onCheckedChange={toggle(o.key)}
                aria-label={o.label}
              />
            </div>
          ))}
        </SurfaceCard>

        <SectionLabel>STRAND updates</SectionLabel>
        <SurfaceCard>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm font-medium">
                News, offers and product updates
              </p>
              <p className="font-body text-xs text-muted-foreground mt-0.5">
                Off unless you choose to receive them. You can unsubscribe at any
                time.
              </p>
            </div>
            <Switch
              checked={prefs.marketing_consent === true}
              onCheckedChange={toggle("marketing_consent")}
              aria-label="STRAND updates"
            />
          </div>
        </SurfaceCard>

        <SectionLabel>Always sent</SectionLabel>
        <SurfaceCard>
          <p className="font-body text-xs text-muted-foreground mb-3">
            These are needed to run your account and meet our legal obligations,
            so they cannot be switched off.
          </p>
          <ul className="space-y-2">
            {ESSENTIAL.map((e) => (
              <li key={e} className="flex items-start gap-2">
                <Lock className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <span className="font-body text-sm">{e}</span>
              </li>
            ))}
          </ul>
        </SurfaceCard>
      </div>
    </ScreenLayout>
  );
};

export default EmailPreferences;
