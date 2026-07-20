import { Link } from "react-router-dom";
import {
  Sparkles,
  HeartPulse,
  AlertTriangle,
  Repeat,
  Wand2,
  Leaf,
  Droplets,
  Target,
  Lightbulb,
} from "lucide-react";
import { useUserProducts, type UserProduct } from "@/hooks/useUserProducts";

interface NextWashTipCardProps {
  action: string;
  why?: string;
  /** Optional slot rendered inside the card (e.g. show/hide toggle, save checkbox). */
  headerRight?: React.ReactNode;
  /** Optional slot rendered below the tip body (e.g. save-to-wash-day checkbox). */
  footer?: React.ReactNode;
  /** When true, hides the action/why body but keeps the header + slots visible. */
  collapsed?: boolean;
}

/** Sub-header labels the AI copy tends to emit, mapped to an icon. Order matters
 *  — longer / more specific labels first so "Product consistency" wins over
 *  "Product tip", etc. Matched case-insensitively at the start of a paragraph
 *  followed by a colon. */
const LABEL_ICONS: Array<{ label: string; Icon: typeof Sparkles }> = [
  { label: "Why it matters", Icon: HeartPulse },
  { label: "Why this matters", Icon: HeartPulse },
  { label: "Product consistency", Icon: Repeat },
  { label: "Do this next wash", Icon: Target },
  { label: "The action", Icon: Target },
  { label: "The rationale", Icon: HeartPulse },
  { label: "Product tip", Icon: Sparkles },
  { label: "Try this", Icon: Sparkles },
  { label: "How to use", Icon: Wand2 },
  { label: "How it helps", Icon: HeartPulse },
  { label: "Watch for", Icon: AlertTriangle },
  { label: "Best sources", Icon: Leaf },
  { label: "Moisture", Icon: Droplets },
  { label: "Strand tip", Icon: Lightbulb },
  { label: "Note", Icon: Lightbulb },
];

const LABEL_RE = new RegExp(
  `\\*{0,2}\\b(${LABEL_ICONS.map((l) => l.label).join("|")})\\b\\*{0,2}\\s*:\\*{0,2}`,
  "gi",
);

const normalise = (raw: string) => {
  let t = String(raw ?? "");
  t = t.replace(/\\n/g, "\n").replace(/\/n\/n/g, "\n\n").replace(/\/n/g, "\n");
  // Force each known label onto a new paragraph.
  t = t.replace(LABEL_RE, (_m, lbl) => `\n\n${lbl}:`);
  return t.replace(/\n{3,}/g, "\n\n").trim();
};

const chunkSentences = (text: string, perChunk = 2): string[] => {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g);
  if (!sentences) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += perChunk) {
    chunks.push(sentences.slice(i, i + perChunk).join(" ").trim());
  }
  return chunks.filter(Boolean);
};

const findLabel = (para: string) => {
  const m = para.match(/^([A-Z][A-Za-z ]{2,24}):\s*([\s\S]*)$/);
  if (!m) return null;
  const key = m[1].toLowerCase().trim();
  const entry = LABEL_ICONS.find((l) => l.label.toLowerCase() === key);
  if (!entry) return null;
  return { label: entry.label, Icon: entry.Icon, body: m[2] };
};

/** Split a line by **bold** markdown and by known product-name occurrences,
 *  emitting <strong> and <Link> nodes for each. Product matches take priority
 *  over bold when they overlap. */
const renderInline = (
  line: string,
  keyPrefix: string,
  products: UserProduct[],
) => {
  // Build a match list of { start, end, kind, product? }
  type Match = { start: number; end: number; kind: "bold" | "product"; text: string; product?: UserProduct };
  const matches: Match[] = [];

  // Products: longest names first to prefer full matches.
  const sorted = [...products]
    .filter((p) => p.name && p.name.trim().length >= 4)
    .sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const escaped = p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const start = m.index;
      const end = start + m[0].length;
      // Skip if this range overlaps an existing product match.
      if (matches.some((x) => x.kind === "product" && !(end <= x.start || start >= x.end))) {
        continue;
      }
      matches.push({ start, end, kind: "product", text: m[0], product: p });
    }
  }

  // Bold matches — skip any that overlap a product hyperlink.
  const boldRe = /\*\*([^*]+)\*\*/g;
  let bm: RegExpExecArray | null;
  while ((bm = boldRe.exec(line))) {
    const start = bm.index;
    const end = start + bm[0].length;
    if (matches.some((x) => !(end <= x.start || start >= x.end))) continue;
    matches.push({ start, end, kind: "bold", text: bm[1] });
  }

  matches.sort((a, b) => a.start - b.start);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) {
      nodes.push(<span key={`${keyPrefix}-t-${i}`}>{line.slice(cursor, m.start)}</span>);
    }
    if (m.kind === "product" && m.product) {
      nodes.push(
        <Link
          key={`${keyPrefix}-p-${i}`}
          to={`/products/profile/${m.product.id}`}
          className="text-[#E8C87A] font-semibold underline decoration-[#C5A059]/50 decoration-1 underline-offset-2 hover:decoration-[#E8C87A] transition"
        >
          {m.text}
        </Link>,
      );
    } else {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-white">
          {m.text}
        </strong>,
      );
    }
    cursor = m.end;
  });
  if (cursor < line.length) {
    nodes.push(<span key={`${keyPrefix}-t-end`}>{line.slice(cursor)}</span>);
  }
  return nodes;
};

/**
 * Editorial dark card that matches the "Current style" block on Home.
 * The `why` body is rendered as broken-up paragraphs with sub-headers,
 * icons, bold keywords, and hyperlinked product names.
 */
export function NextWashTipCard({
  action,
  why,
  headerRight,
  footer,
  collapsed = false,
}: NextWashTipCardProps) {
  const { products } = useUserProducts("all");

  // Split `why` into paragraphs; auto-chunk long unbroken text.
  let paras: string[] = [];
  if (why) {
    const raw = normalise(why);
    paras = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paras.length <= 1 && raw.length > 220) {
      paras = chunkSentences(raw, 2);
    } else {
      paras = paras.flatMap((p) => (p.length > 260 ? chunkSentences(p, 2) : [p]));
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/5 shadow-xl bg-[#4A3728]">
      {/* Decorative glows / rings — mirrored from the current style card */}
      <div className="pointer-events-none absolute top-0 right-0 w-48 h-48 bg-[#C5A059]/10 rounded-full -mr-20 -mt-20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-16 left-0 w-24 h-24 border border-[#C5A059]/10 rounded-full -ml-12" />
      <div className="pointer-events-none absolute -bottom-6 -right-6 opacity-5">
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#C5A059" strokeWidth="0.5">
          <path d="M12 2C12 2 12 10 4 12C12 14 12 22 12 22C12 22 12 14 20 12C12 10 12 2 12 2Z" />
        </svg>
      </div>

      <div className="relative z-10 p-6">
        {/* Header row */}
        <div className="flex justify-between items-start mb-4">
          <div className="min-w-0 pr-3 flex items-center gap-2">
            <Sparkles className="size-3.5 text-[#C5A059] shrink-0" />
            <p className="text-[#C5A059] uppercase tracking-[0.25em] text-[10px] font-semibold font-body">
              Tip for your next wash day
            </p>
          </div>
          {headerRight}
        </div>

        {!collapsed && (
          <>
            {action && (
              <h3 className="font-display text-white text-[20px] leading-snug break-words">
                {action}
              </h3>
            )}

            {paras.length > 0 && (
              <>
                {/* Divider — dot + gradient rules, same motif as Home */}
                <div className="relative flex items-center my-4">
                  <div className="flex-grow h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <div className="mx-3 w-1 h-1 bg-[#C5A059] rounded-full shadow-[0_0_8px_#C5A059]" />
                  <div className="flex-grow h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>

                <div className="space-y-4">
                  {paras.map((p, i) => {
                    const labelled = findLabel(p);
                    if (labelled) {
                      const { label, Icon, body } = labelled;
                      return (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center size-6 rounded-full bg-[#C5A059]/15 border border-[#C5A059]/30">
                              <Icon className="size-3 text-[#C5A059]" />
                            </span>
                            <p className="text-[#C5A059] text-[9px] uppercase tracking-[0.22em] font-bold font-body">
                              {label}
                            </p>
                          </div>
                          <p className="text-[#E0D7CC]/90 text-[13px] leading-relaxed font-body break-words pl-8">
                            {renderInline(body, `p${i}`, products)}
                          </p>
                        </div>
                      );
                    }
                    // Unlabelled paragraph — plain body copy, but the first
                    // one gets a subtle "Why it matters" tag so the block
                    // always reads with a clear hierarchy.
                    if (i === 0) {
                      return (
                        <div key={i} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center size-6 rounded-full bg-[#C5A059]/15 border border-[#C5A059]/30">
                              <HeartPulse className="size-3 text-[#C5A059]" />
                            </span>
                            <p className="text-[#C5A059] text-[9px] uppercase tracking-[0.22em] font-bold font-body">
                              Why it matters
                            </p>
                          </div>
                          <p className="text-[#E0D7CC]/90 text-[13px] leading-relaxed font-body break-words pl-8">
                            {renderInline(p, `p${i}`, products)}
                          </p>
                        </div>
                      );
                    }
                    return (
                      <p
                        key={i}
                        className="text-[#E0D7CC]/90 text-[13px] leading-relaxed font-body break-words pl-8"
                      >
                        {renderInline(p, `p${i}`, products)}
                      </p>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {footer && <div className="mt-5">{footer}</div>}
      </div>
    </div>
  );
}
