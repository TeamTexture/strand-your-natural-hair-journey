import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type Suggestion = { user_id: string; display_name: string; avatar_url: string | null };

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
}

/** Textarea that lets STRAND+ members tag others by typing "@". */
const MentionTextarea = ({ value, onChange, placeholder, rows = 6, maxLength, className }: Props) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [atStart, setAtStart] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(async () => {
      const { data } = await supabase.rpc("forum_search_plus_members", { _query: query, _limit: 8 });
      if (!cancelled) {
        setSuggestions((data as Suggestion[]) ?? []);
        setLoading(false);
      }
    }, 150);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [open, query]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    const caret = e.target.selectionStart ?? v.length;
    // Look backwards for the last "@" without whitespace after it.
    const before = v.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at < 0) { setOpen(false); setAtStart(null); return; }
    const between = before.slice(at + 1);
    if (/\s/.test(between) || between.length > 30) { setOpen(false); setAtStart(null); return; }
    // Require @ at start or after whitespace
    if (at > 0 && !/\s/.test(before[at - 1])) { setOpen(false); setAtStart(null); return; }
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
    const inserted = `@${s.display_name} `;
    const next = before + inserted + after;
    onChange(next);
    setOpen(false);
    setAtStart(null);
    // Restore cursor after the inserted mention.
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className={className}
      />
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-lg max-h-56 overflow-auto">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-body text-foreground/50 border-b border-border">
            Tag a STRAND+ member
          </p>
          {loading ? (
            <div className="p-3 flex justify-center"><Loader2 className="size-4 animate-spin text-primary" /></div>
          ) : suggestions.length === 0 ? (
            <p className="p-3 text-[12px] font-body text-foreground/60">No matches</p>
          ) : (
            <ul>
              {suggestions.map((s) => (
                <li key={s.user_id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertMention(s); }}
                    className="w-full text-left px-3 py-2 hover:bg-primary/10 flex items-center gap-2"
                  >
                    <div className="size-6 rounded-full bg-muted overflow-hidden shrink-0">
                      {s.avatar_url && <img src={s.avatar_url} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <span className="text-[13px] font-body font-semibold">@{s.display_name}</span>
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
