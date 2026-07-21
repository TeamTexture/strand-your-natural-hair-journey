import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, Calendar, Eye, StickyNote, ShieldOff } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import { Input } from "@/components/ui/input";
import { useProClients, type ProClientRow } from "@/hooks/useProClients";
import { formatRelative } from "@/lib/formatPassportDate";

const shortDate = (iso: string | null): string => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

const firstName = (c: ProClientRow): string => {
  const n = (c.display_name ?? "").trim();
  if (!n) return "Client";
  return n.split(/\s+/)[0];
};

const activityTs = (c: ProClientRow): number => {
  const candidates: (string | null)[] = [
    c.next_appointment_date,
    c.last_view_at,
    c.last_appointment_date,
    c.granted_at,
  ];
  for (const v of candidates) if (v) return new Date(v).getTime();
  return 0;
};

const ProClients = () => {
  const nav = useNavigate();
  const { data = [], isLoading } = useProClients();
  const [tab, setTab] = useState<"active" | "past">("active");
  const [q, setQ] = useState("");

  const active = useMemo(() => data.filter((c) => !c.revoked_at), [data]);
  const past = useMemo(() => data.filter((c) => !!c.revoked_at), [data]);

  const list = useMemo(() => {
    const source = tab === "active" ? active : past;
    const term = q.trim().toLowerCase();
    const filtered = term
      ? source.filter((c) => (c.display_name ?? "").toLowerCase().includes(term))
      : source;
    if (tab === "active") {
      // Upcoming appointment first, then most recent activity.
      return [...filtered].sort((a, b) => {
        const aNext = a.next_appointment_date ? new Date(a.next_appointment_date).getTime() : Infinity;
        const bNext = b.next_appointment_date ? new Date(b.next_appointment_date).getTime() : Infinity;
        if (aNext !== bNext) return aNext - bNext;
        return activityTs(b) - activityTs(a);
      });
    }
    // Past: most recently revoked first.
    return [...filtered].sort((a, b) => {
      const ar = a.revoked_at ? new Date(a.revoked_at).getTime() : 0;
      const br = b.revoked_at ? new Date(b.revoked_at).getTime() : 0;
      return br - ar;
    });
  }, [tab, active, past, q]);

  const renderActive = (c: ProClientRow) => {
    const name = firstName(c);
    return (
      <button
        key={c.access_id}
        type="button"
        onClick={() => nav(`/pro/clients/${c.consumer_id}`)}
        className="w-full text-left rounded-[14px] border border-border bg-card p-4 flex items-center gap-3 hover:border-primary/40 transition-colors"
      >
        <ProAvatar name={name} photoUrl={c.avatar_url ?? undefined} size="size-12" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-display text-[15px] font-semibold leading-tight truncate">{name}</p>
          <p className="text-[11px] text-muted-foreground font-body">
            Consent since {shortDate(c.granted_at)}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-body text-foreground/75 pt-0.5">
            {c.next_appointment_date && (
              <span className="inline-flex items-center gap-1 text-primary">
                <Calendar className="size-3" /> Next {shortDate(c.next_appointment_date)}
              </span>
            )}
            {!c.next_appointment_date && c.last_appointment_date && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3" /> Last {shortDate(c.last_appointment_date)}
              </span>
            )}
            {c.appointment_count > 0 && (
              <span className="text-muted-foreground">{c.appointment_count} appt{c.appointment_count === 1 ? "" : "s"}</span>
            )}
            {c.last_view_at && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Eye className="size-3" /> Viewed {formatRelative(c.last_view_at)}
              </span>
            )}
            {c.note_count > 0 && (
              <span className="inline-flex items-center gap-1 text-primary/85">
                <StickyNote className="size-3" /> {c.note_count} note{c.note_count === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="size-4 text-primary/70 shrink-0" />
      </button>
    );
  };

  const renderPast = (c: ProClientRow) => {
    const name = firstName(c);
    return (
      <button
        key={c.access_id}
        type="button"
        onClick={() => nav(`/pro/clients/${c.consumer_id}/past`)}
        className="w-full text-left rounded-[14px] border border-border bg-card/70 p-4 flex items-center gap-3 hover:border-primary/30 transition-colors"
      >
        <div className="size-10 rounded-[12px] bg-muted flex items-center justify-center shrink-0">
          <ShieldOff className="size-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[14px] font-semibold leading-tight truncate">{name}</p>
          <p className="text-[11px] text-muted-foreground font-body mt-0.5">
            {shortDate(c.granted_at)} → {shortDate(c.revoked_at)}
          </p>
          {c.note_count > 0 && (
            <p className="text-[11px] text-primary/80 font-body mt-0.5 inline-flex items-center gap-1">
              <StickyNote className="size-3" /> {c.note_count} private note{c.note_count === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
      </button>
    );
  };

  return (
    <ScreenLayout>
      <TitleBar title="Clients" onBack={() => nav("/pro")} />
      <div className="px-5 pb-8 space-y-4">
        <p className="text-[12px] text-muted-foreground font-body leading-snug">
          Your client book. Access is granted when a client accepts you via an enquiry.
        </p>

        <div className="flex items-center gap-1 p-1 rounded-full bg-secondary/60 border border-border w-full">
          {(["active", "past"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 h-9 rounded-full text-[12px] font-body font-medium capitalize transition-colors ${
                tab === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {k === "active" ? `Active (${active.length})` : `Past (${past.length})`}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name"
            className="pl-9 h-10 text-[13px] font-body"
          />
        </div>

        {isLoading ? (
          <LoadingDot label="Loading clients…" fullScreen={false} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={tab === "active" ? "👥" : "🗂️"}
            message={
              tab === "active"
                ? q ? "No matches" : "No active clients yet"
                : q ? "No matches" : "No past clients"
            }
            hint={
              tab === "active"
                ? "When a client accepts your enquiry, they'll appear here."
                : "Clients you no longer have access to will appear here with dates only."
            }
          />
        ) : (
          <>
            <SectionLabel>
              {tab === "active" ? "Upcoming first, then most recent activity" : "Most recently ended first"}
            </SectionLabel>
            <div className="space-y-2.5">
              {list.map((c) => (tab === "active" ? renderActive(c) : renderPast(c)))}
            </div>
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default ProClients;
