import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type Suggestion = {
  kind: "everyone" | "member" | "pro" | "brand";
  entity_id: string | null;
  label: string;
  subtitle: string | null;
  avatar_url: string | null;
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
}

const KIND_LABEL: Record<Suggestion["kind"], string> = {
  everyone: "Everyone",
  member: "Member",
  pro: "Pro",
  brand: "Brand",
};

const KIND_TONE: Record<Suggestion["kind"], string> = {
  everyone: "bg-orange-500/15 text-orange-600 border-orange-500/40",
  member: "bg-primary/10 text-primary border-primary/30",
  pro: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  brand: "bg-purple-500/10 text-purple-700 border-purple-500/30",
};

/** Textarea with universal @-tagging (members, pros, brands, @everyone) and orange selection highlight. */
const MentionTextarea = ({ value, onChange, placeholder, rows = 6, maxLength, className }: Props) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [atStart, setAtStart] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [flashLabel, setFlashLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(async () => {
      const { data } = await supabase.rpc("mention_search_all", { _query: query, _limit: 12 });
      if (cancelled) return;
      const rows = (data as Suggestion[]) ?? [];
      const everyone: Suggestion = {
        kind: "everyone",
        entity_id: null,
        label: "everyone",
        subtitle: "Notify all STRAND+ members",
        avatar_url: null,
      };
      const matchesEveryone = "everyone".startsWith(query.toLowerCase()) || query === "";
      setSuggestions(matchesEveryone ? [everyone, ...rows] : rows);
      setActiveIdx(0);
      setLoading(false);
    }, 150);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [open, query]);

  const closeMenu = () => { setOpen(false); setAtStart(null); setActiveIdx(0); };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    const caret = e.target.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at < 0) return closeMenu();
    const between = before.slice(at + 1);
    if (/\s/.test(between) || between.length > 30) return closeMenu();
    if (at > 0 && !/[\s\n]/.test(before[at - 1])) return closeMenu();
    setAtStart(at);
    setQuery(between);
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
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className={className}
      />
      {flashLabel && (
        <div className="pointer-events-none absolute -top-7 right-2 rounded-full bg-orange-500 text-white text-[11px] font-body px-2.5 py-1 shadow animate-in fade-in slide-in-from-bottom-1">
          Tagged @{flashLabel}
        </div>
      )}
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-lg max-h-72 overflow-auto">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-body text-foreground/50 border-b border-border">
            Tag someone
          </p>
          {loading ? (
            <div className="p-3 flex justify-center"><Loader2 className="size-4 animate-spin text-primary" /></div>
          ) : suggestions.length === 0 ? (
            <p className="p-3 text-[12px] font-body text-foreground/60">No matches</p>
          ) : (
            <ul>
              {suggestions.map((s, i) => (
                <li key={`${s.kind}-${s.entity_id ?? "all"}-${i}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseDown={(e) => { e.preventDefault(); insertMention(s); }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                      i === activeIdx ? "bg-orange-500/15" : "hover:bg-primary/5"
                    }`}
                  >
                    <div className="size-7 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                      {s.avatar_url ? (
                        <img src={s.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[11px] font-semibold text-foreground/60">
                          {s.kind === "everyone" ? "★" : s.label.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[13px] font-body font-semibold truncate ${i === activeIdx ? "text-orange-600" : ""}`}>
                          @{s.label}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider border ${KIND_TONE[s.kind]}`}>
                          {KIND_LABEL[s.kind]}
                        </span>
                      </div>
                      {s.subtitle && (
                        <p className="text-[11px] text-foreground/55 font-body truncate">{s.subtitle}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default MentionTextarea;
