import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import HairStrandIcon from "@/components/HairStrandIcon";
import { Button } from "@/components/ui/button";
import LoadingDot from "@/components/LoadingDot";

// The beta `supabase.auth.oauth` namespace isn't in the generated types yet.
// Keep a narrow local typed wrapper — do NOT hit raw `/oauth/authorizations`.
type AuthorizationDetails = {
  client?: { name?: string; client_id?: string } | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
  redirect_uri?: string | null;
};
type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};
const oauth = () =>
  (supabase.auth as unknown as { oauth: OAuthNs }).oauth;

const safeNext = (raw: string | null) => {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id in the request.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?mode=signin&next=" + encodeURIComponent(next);
        return;
      }
      try {
        const { data, error: e } = await oauth().getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (e) {
          setError(e.message);
          return;
        }
        const immediate = safeNext(data?.redirect_url ?? data?.redirect_to ?? null) ?? data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load authorization request.");
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      const { data, error: e } = approve
        ? await oauth().approveAuthorization(authorizationId)
        : await oauth().denyAuthorization(authorizationId);
      if (e) {
        setError(e.message);
        setBusy(false);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setError("The authorization server did not return a redirect URL.");
        setBusy(false);
        return;
      }
      window.location.href = target;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  if (error) {
    return (
      <ScreenLayout>
        <TitleBar title="Connection request" />
        <div className="px-7 pt-4 pb-10">
          <p className="font-body text-sm text-destructive">{error}</p>
          <p className="font-body text-xs text-muted-foreground mt-3">
            Close this window and try again from your assistant. If the problem persists, the
            authorization link may have expired.
          </p>
        </div>
      </ScreenLayout>
    );
  }

  if (!details) {
    return (
      <ScreenLayout>
        <LoadingDot />
      </ScreenLayout>
    );
  }

  const clientName = details.client?.name ?? "an external app";
  const redirect = details.redirect_uri ?? details.redirect_url ?? details.redirect_to ?? "";

  return (
    <ScreenLayout>
      <TitleBar title="Connection request" />
      <div className="px-7 pt-2 pb-10 flex flex-col h-full">
        <div className="flex flex-col items-center text-center mb-6">
          <HairStrandIcon className="w-12 h-12 text-primary mb-4" />
          <h1 className="font-display text-2xl leading-tight mb-2">
            Connect {clientName} to STRAND
          </h1>
          <p className="font-body text-sm text-muted-foreground max-w-[280px]">
            This lets {clientName} use STRAND as you. Your row-level security still decides what
            data it can read or write.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3 mb-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              Requesting access as
            </p>
            <p className="font-body text-sm">{clientName}</p>
          </div>
          {redirect && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
                Redirects to
              </p>
              <p className="font-body text-xs text-muted-foreground break-all">{redirect}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-1">
              Access
            </p>
            <ul className="font-body text-xs text-foreground/80 list-disc pl-4 space-y-1">
              <li>Read your STRAND hair profile, wash days, products, goals, and journal</li>
              <li>Read blood markers flagged outside the normal range</li>
              <li>Create new style journal entries on your behalf</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-auto">
          <Button
            variant="gold"
            size="pill"
            disabled={busy}
            onClick={() => decide(true)}
          >
            {busy ? "Please wait…" : "Approve"}
          </Button>
          <Button
            variant="outline"
            size="pill"
            disabled={busy}
            onClick={() => decide(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </ScreenLayout>
  );
}
