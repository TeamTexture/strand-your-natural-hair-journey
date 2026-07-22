import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronRight, Calendar, StickyNote, ShieldOff } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import { Input } from "@/components/ui/input";
import { useProClients, type ProClientRow } from "@/hooks/useProClients";
import { formatRelative } from "@/lib/formatPassportDate";
import { smartBack } from "@/lib/smartBack";

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
    const open = () => nav(`/pro/clients/${c.consumer_id}`);
    return (
      <div
        key={c.access_id}
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        className="group w-full text-left rounded-[16px] border border-border bg-card p-4 space-y-3 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <ProAvatar name={name} photoUrl={c.avatar_url ?? undefined} size="size-14" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-[16px] font-semibold leading-tight truncate">{name}</p>
            <p className="text-[11px] text-muted-foreground font-body mt-0.5">
              Client since {shortDate(c.granted_at)}
            </p>
          </div>
          {c.next_appointment_date && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/12 text-primary px-2.5 py-1 text-[10.5px] font-body font-medium uppercase tracking-wide">
              <Calendar className="size-3" /> Upcoming
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-[12px] bg-secondary/40 border border-border/70 px-2.5 py-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-body">Appts</p>
            <p className="font-display text-[17px] font-semibold leading-none mt-1">{c.appointment_count}</p>
          </div>
          <div className="rounded-[12px] bg-secondary/40 border border-border/70 px-2.5 py-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-body">Notes</p>
            <p className="font-display text-[17px] font-semibold leading-none mt-1">{c.note_count}</p>
          </div>
          <div className="rounded-[12px] bg-secondary/40 border border-border/70 px-2.5 py-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-body">Last view</p>
            <p className="font-body text-[11px] font-medium leading-none mt-1.5 truncate">
              {c.last_view_at ? formatRelative(c.last_view_at) : "—"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex flex-col gap-0.5 text-[11px] font-body text-foreground/75 min-w-0">
            {c.next_appointment_date ? (
              <span className="inline-flex items-center gap-1 text-primary">
                <Calendar className="size-3" /> Next {shortDate(c.next_appointment_date)}
              </span>
            ) : c.last_appointment_date ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Calendar className="size-3" /> Last {shortDate(c.last_appointment_date)}
              </span>
            ) : (
              <span className="text-muted-foreground">No appointments yet</span>
            )}
            {c.note_count > 0 && (
              <span className="inline-flex items-center gap-1 text-primary/85">
                <StickyNote className="size-3" /> {c.note_count} private note{c.note_count === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-4 h-9 text-[12px] font-body font-medium hover:opacity-90 transition-opacity"
          >
            Review <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
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
      <TitleBar title="Clients" onBack={smartBack(nav, "/pro")} />
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
