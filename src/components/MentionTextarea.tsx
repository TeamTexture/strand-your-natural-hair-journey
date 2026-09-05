import { useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import ForumAvatar from "@/components/ForumAvatar";
import { mentionMatchRank } from "@/lib/forumMeta";

type Suggestion = {
  kind: "everyone" | "member" | "pro" | "brand";
  entity_id: string | null;
  label: string;
  subtitle: string | null;
  avatar_url: string | null;
};

export type ResolvedMention = { user_id: string; label: string };

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
  disabled?: boolean;
  /** When set, search prioritises people who have posted in this thread. */
  threadId?: string;
  /** Fires whenever a mention is picked, so the caller can notify by id. */
  onMention?: (m: ResolvedMention) => void;
}

const KIND_LABEL: Record<Suggestion["kind"], string> = {
  everyone: "Everyone",
  member: "Member",
  pro: "Pro",
  brand: "Brand",
};

const KIND_TONE: Record<Suggestion["kind"], string> = {
  everyone: "bg-primary/12 text-primary border-primary/30",
  member: "bg-primary/10 text-primary border-primary/30",
  pro: "bg-brown/10 text-brown border-brown/25",
  brand: "bg-[hsl(var(--icon-muted))] text-[hsl(var(--gold-deep))] border-border",
};

/** Textarea with universal @-tagging (members, pros, brands, @everyone). */
const MentionTextarea = ({
  value,
  onChange,
  placeholder,
  rows = 6,
  maxLength,
  className,
  disabled = false,
  threadId,
  onMention,
}: Props) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rawRows, setRawRows] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [atStart, setAtStart] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [flashLabel, setFlashLabel] = useState<string | null>(null);
  const [dropUp, setDropUp] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const t = window.setTimeout(async () => {
      // Thread context: prefer people already in the conversation.
      const res = threadId
        ? await supabase.rpc("forum_mention_search", { _thread_id: threadId, _query: query, _limit: 12 })
        : await supabase.rpc("mention_search_all", { _query: query, _limit: 12 });
      if (cancelled) return;
      if (res.error) {
        // Never fail silently — a broken search used to render as "No matches".
        console.error("[MentionTextarea] mention search failed", res.error);
        setRawRows([]);
        setFailed(true);
        setLoading(false);
        return;
      }
      setRawRows(((res.data as Suggestion[]) ?? []).filter((r) => !!r.label));
      setActiveIdx(0);
      setLoading(false);
    }, 150);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [open, query, threadId]);

  /**
   * The search function matches a substring anywhere in the full name, which
   * surfaced people whose name only contains the letters mid-word. Keep only
   * prefix matches (first name, any other name word, or the handle) and rank
   * exact then prefix matches first.
   */
  const suggestions = useMemo<Suggestion[]>(() => {
    const q = query.trim();
    const ranked = rawRows
      .map((r) => ({ r, rank: mentionMatchRank(r.label, q) }))
      .filter((x): x is { r: Suggestion; rank: number } => x.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.r.label.localeCompare(b.r.label))
      .map((x) => x.r);
    const everyone: Suggestion = {
      kind: "everyone",
      entity_id: null,
      label: "everyone",
      subtitle: "Notify all STRAND+ members",
      avatar_url: null,
    };
    const matchesEveryone = q === "" || "everyone".startsWith(q.toLowerCase());
    return matchesEveryone ? [everyone, ...ranked] : ranked;
  }, [rawRows, query]);

  useEffect(() => { setActiveIdx(0); }, [suggestions.length]);

  const closeMenu = () => { setOpen(false); setAtStart(null); setActiveIdx(0); setFailed(false); };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    const caret = e.target.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at < 0) return closeMenu();
    const between = before.slice(at + 1);
    // Display names are full names, so allow spaces — up to 4 words — instead of
    // closing the menu the moment the member types a space.
    if (/[\n]/.test(between) || between.length > 40) return closeMenu();
    if (between.trim().split(/\s+/).filter(Boolean).length > 4) return closeMenu();
    if (at > 0 && !/[\s\n]/.test(before[at - 1])) return closeMenu();
    setAtStart(at);
    setQuery(between);
    // Bottom-docked composers have no room below — flip the menu upwards.
    const box = ref.current?.getBoundingClientRect();
    setDropUp(!!box && box.bottom > window.innerHeight - 260);
    setOpen(true);
  };

  const insertMention = (s: Suggestion) => {
    if (atStart == null || !ref.current) return;
    const el = ref.current;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, atStart);
    const after = value.slice(caret);
    const cleanLabel = s.label.replace(/\s+/g, " ").trim();
    const inserted = `@${cleanLabel} `;
    const next = before + inserted + after;
    onChange(next);
    if (s.entity_id && s.kind !== "everyone") onMention?.({ user_id: s.entity_id, label: cleanLabel });
    setFlashLabel(cleanLabel);
    window.setTimeout(() => setFlashLabel(null), 900);
    closeMenu();
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(suggestions[activeIdx]); }
    else if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
  };

  return (
    <div className="relative">
      {/* While the picker is open, what is behind it is dimmed and inert, so a
          delete control or a half-hidden comment can never be tapped by mistake. */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-foreground/25"
          onMouseDown={(e) => { e.preventDefault(); closeMenu(); }}
        />
      )}
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        className={className}
      />
      {flashLabel && (
        <div className="pointer-events-none absolute -top-7 right-2 z-30 rounded-full bg-primary text-primary-foreground text-[11px] font-body px-2.5 py-1 shadow animate-in fade-in slide-in-from-bottom-1">
          Tagged @{flashLabel}
        </div>
      )}
      {open && (
        <div
          className={`absolute z-30 left-0 right-0 rounded-[10px] border border-border bg-card shadow-lg max-h-64 overflow-auto ${dropUp ? "bottom-full mb-1.5" : "mt-1.5"}`}
        >
          <p className="sticky top-0 bg-card px-3 py-2 text-[10px] uppercase tracking-wider font-body font-semibold text-foreground/55 border-b border-border">
            Tag someone
          </p>
          {loading ? (
            <div className="p-3 flex justify-center"><Loader2 className="size-4 animate-spin text-primary" /></div>
          ) : failed ? (
            <p className="p-3 text-[12px] font-body text-alert-dark">Couldn't load members. Check your connection and try again.</p>
          ) : suggestions.length === 0 ? (
            <p className="p-3 text-[12px] font-body text-foreground/60">No matches</p>
          ) : (
            <ul>
              {suggestions.map((s, i) => {
                // The pill already says what she is — don't repeat it underneath.
                const subtitle =
                  s.subtitle && s.subtitle.trim().toLowerCase() !== KIND_LABEL[s.kind].toLowerCase()
                    ? s.subtitle
                    : null;
                return (
                  <li key={`${s.kind}-${s.entity_id ?? "all"}-${i}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(i)}
                      onMouseDown={(e) => { e.preventDefault(); insertMention(s); }}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                        i === activeIdx ? "bg-primary/12" : "hover:bg-primary/5"
                      }`}
                    >
                      {s.kind === "everyone" ? (
                        <div className="size-7 rounded-full bg-[hsl(var(--icon-muted))] text-primary flex items-center justify-center text-[11px] font-body font-semibold shrink-0">
                          @
                        </div>
                      ) : (
                        <ForumAvatar path={s.avatar_url} fallback={s.label} className="size-7 text-[10.5px]" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[13px] font-body font-semibold truncate whitespace-nowrap ${
                              i === activeIdx ? "text-primary" : ""
                            }`}
                          >
                            @{s.label}
                          </span>
                          <span
                            className={`shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider border ${KIND_TONE[s.kind]}`}
                          >
                            {KIND_LABEL[s.kind]}
                          </span>
                        </div>
                        {subtitle && (
                          <p className="text-[11px] text-foreground/55 font-body truncate mt-0.5">{subtitle}</p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default MentionTextarea;
