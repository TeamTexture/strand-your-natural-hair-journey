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
  FlaskConical,
  Scissors,
  type LucideIcon,
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
const TEAM_TEXTURE_URL = "https://www.teamtexture.co.uk";

const LABEL_ICONS: Array<{ label: string; Icon: LucideIcon }> = [
  { label: "Why it matters", Icon: HeartPulse },
  { label: "Why this matters", Icon: HeartPulse },
  { label: "Product consistency", Icon: Repeat },
  { label: "Ingredient note", Icon: FlaskConical },
  { label: "Goal focus", Icon: Target },
  { label: "Scalp signal", Icon: Sparkles },
  { label: "Technique", Icon: Scissors },
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
  t = normaliseHeatLanguage(t);
  // Force each known label onto a new paragraph.
  t = t.replace(LABEL_RE, (_m, lbl) => `\n\n${lbl}:`);
  return t.replace(/\n{3,}/g, "\n\n").trim();
};

const normaliseHeatLanguage = (raw: string) => {
  let t = String(raw ?? "");
  t = t.replace(/\[\s*TT\s+Heat\s+Hat\s*\]\(\s*(?:https?:\/\/)?(?:www\.)?teamtexture\.co\.uk\/?\s*\)/gi, "TT Heat Hat");
  t = t.replace(/TT\s+Heat\s+Hat\s*\(\s*(?:https?:\/\/)?(?:www\.)?teamtexture\.co\.uk\/?\s*\)/gi, "TT Heat Hat");
  t = t.replace(/(?:https?:\/\/)?(?:www\.)?teamtexture\.co\.uk\/?/gi, "TT Heat Hat");
  t = t.replace(
    /\b(?:a\s+|the\s+)?(?:generic\s+)?(?:heat\s*hat|heat\s*aht|heated\s+cap|heat\s+cap|thermal\s+cap|deep-conditioning\s+cap|deep\s+conditioning\s+cap|plastic\s+cap|shower\s+cap|warm\s+towel|steamer|steamers)\b/gi,
    "the TT Heat Hat",
  );
  t = t.replace(/\b(?:the\s+)?TT\s+Heat\s+Hat\s+(?:TT\s+Heat\s+Hat\s*)+/gi, "the TT Heat Hat");
  t = t.replace(/\bthe\s+the\s+TT\s+Heat\s+Hat\b/gi, "the TT Heat Hat");
  return t.replace(/[ \t]{2,}/g, " ");
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

const inferLabel = (text: string, index: number) => {
  const lower = text.toLowerCase();
  if (/\b(ingredient|glycerin|aqua|water|oil|butter|aloe|honey|silicone|sulfate|sulphate|alcohol|protein|keratin)\b/.test(lower)) {
    return LABEL_ICONS.find((l) => l.label === "Ingredient note")!;
  }
  if (/\b(3\s*[–-]\s*4|three\s+to\s+four|wash cycles|same product|keep using|consistency|sequence)\b/.test(lower)) {
    return LABEL_ICONS.find((l) => l.label === "Product consistency")!;
  }
  if (/\b(tt heat hat|deep.?condition|mask|slip|section|detangle|rinse)\b/.test(lower)) {
    return LABEL_ICONS.find((l) => l.label === "Technique")!;
  }
  if (/\b(scalp|itch|flake|cleanse|circulation)\b/.test(lower)) {
    return LABEL_ICONS.find((l) => l.label === "Scalp signal")!;
  }
  if (/\b(length|retention|ends|breakage|low manipulation|low tension|protective)\b/.test(lower)) {
    return LABEL_ICONS.find((l) => l.label === "Goal focus")!;
  }
  if (/\b(dry|dryness|moisture|hydration|high porosity|humidity|porous)\b/.test(lower)) {
    return LABEL_ICONS.find((l) => l.label === "Moisture")!;
  }
  if (/\b(watch|avoid|irritation|build.?up|stiff|snap|reaction)\b/.test(lower)) {
    return LABEL_ICONS.find((l) => l.label === "Watch for")!;
  }
  return index === 0
    ? LABEL_ICONS.find((l) => l.label === "Why it matters")!
    : LABEL_ICONS.find((l) => l.label === "Strand tip")!;
};

const buildTipSections = (why?: string) => {
  if (!why) return [];
  const raw = normalise(why);
  const paragraphs = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sections: Array<{ label: string; Icon: LucideIcon; body: string }> = [];

  paragraphs.forEach((paragraph) => {
    const labelled = findLabel(paragraph);
    if (labelled) {
      const chunks = chunkSentences(labelled.body, 1);
      chunks.forEach((body) => sections.push({ label: labelled.label, Icon: labelled.Icon, body }));
      return;
    }

    chunkSentences(paragraph, 1).forEach((body) => {
      const { label, Icon } = inferLabel(body, sections.length);
      sections.push({ label, Icon, body });
    });
  });

  return sections;
};

/** Split a line by **bold** markdown and by known product-name occurrences,
 *  emitting <strong> and <Link> nodes for each. Product matches take priority
 *  over bold when they overlap. */
const renderInline = (
  line: string,
  keyPrefix: string,
  products: UserProduct[],
) => {
  const safeLine = normaliseHeatLanguage(line).replace(/\*\*([^*]+)\*\*/g, "$1");
  // Build a match list of { start, end, kind, product? }
  type Match = {
    start: number;
    end: number;
    kind: "bold" | "product" | "brand" | "ingredient" | "heat" | "autoBold";
    text: string;
    product?: UserProduct;
    href?: string;
  };
  const matches: Match[] = [];

  const hasOverlap = (start: number, end: number) =>
    matches.some((x) => !(end <= x.start || start >= x.end));

  const addRegexMatches = (
    re: RegExp,
    factory: (text: string) => Omit<Match, "start" | "end" | "text">,
  ) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(safeLine))) {
      const start = m.index;
      const end = start + m[0].length;
      if (hasOverlap(start, end)) continue;
      matches.push({ start, end, text: m[0], ...factory(m[0]) });
      if (m[0].length === 0) re.lastIndex += 1;
    }
  };

  // Products: longest names first to prefer full matches.
  const sorted = [...products]
    .filter((p) => p.name && p.name.trim().length >= 4)
    .sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const escaped = p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(safeLine))) {
      const start = m.index;
      const end = start + m[0].length;
      // Skip if this range overlaps an existing product match.
      if (hasOverlap(start, end)) continue;
      matches.push({ start, end, kind: "product", text: m[0], product: p });
    }

    if (/lola/i.test(`${p.name} ${p.brand ?? ""}`) && /mask|condition/i.test(`${p.name} ${p.category ?? ""}`)) {
      const aliasRe = /\blola\s+mask\b/gi;
      let alias: RegExpExecArray | null;
      while ((alias = aliasRe.exec(safeLine))) {
        const start = alias.index;
        const end = start + alias[0].length;
        if (hasOverlap(start, end)) continue;
        matches.push({ start, end, kind: "product", text: alias[0], product: p });
      }
    }
  }

  const brands = Array.from(new Set(products.map((p) => p.brand?.trim()).filter((b): b is string => Boolean(b && b.length >= 2))))
    .sort((a, b) => b.length - a.length);
  for (const brand of brands) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    addRegexMatches(new RegExp(`\\b${escaped}\\b`, "gi"), () => ({
      kind: "brand",
      href: `/products/brand/${encodeURIComponent(brand)}`,
    }));
  }

  const ingredients = Array.from(new Set(products.flatMap((p) => [
    ...(p.ingredients ?? []),
    ...(p.key_ingredients ?? []).map((i) => i.name),
  ]).map((i) => i?.trim()).filter((i): i is string => Boolean(i && i.length >= 4))))
    .sort((a, b) => b.length - a.length)
    .slice(0, 250);
  for (const ingredient of ingredients) {
    const escaped = ingredient.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    addRegexMatches(new RegExp(`\\b${escaped}\\b`, "gi"), () => ({
      kind: "ingredient",
      href: `/products/ingredient-research?ingredient=${encodeURIComponent(ingredient)}`,
    }));
  }

  addRegexMatches(/\bTT\s+Heat\s+Hat\b/gi, () => ({
    kind: "heat",
    href: TEAM_TEXTURE_URL,
  }));

  // Bold matches — skip any that overlap a product hyperlink.
  const boldRe = /\*\*([^*]+)\*\*/g;
  let bm: RegExpExecArray | null;
  while ((bm = boldRe.exec(safeLine))) {
    const start = bm.index;
    const end = start + bm[0].length;
    if (hasOverlap(start, end)) continue;
    matches.push({ start, end, kind: "bold", text: bm[1] });
  }

  [
    "every 7 days",
    "weekly rhythm",
    "once a week",
    "3–4 wash cycles",
    "3-4 wash cycles",
    "moisture-first",
    "high porosity",
    "length retention",
    "low manipulation",
    "low tension",
    "tuck your ends",
    "deep conditioning mask",
    "conditioner slip",
    "flagged ingredient",
    "consistently flagged",
    "same products",
    "mask",
    "scalp",
    "breakage",
    "dryness",
    "humidity",
    "product sequence",
  ].forEach((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    addRegexMatches(new RegExp(`\\b${escaped}\\b`, "gi"), () => ({ kind: "autoBold" }));
  });

  matches.sort((a, b) => a.start - b.start);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) {
      nodes.push(<span key={`${keyPrefix}-t-${i}`}>{safeLine.slice(cursor, m.start)}</span>);
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
    } else if (m.kind === "brand" || m.kind === "ingredient") {
      nodes.push(
        <Link
          key={`${keyPrefix}-${m.kind}-${i}`}
          to={m.href ?? "#"}
          className="font-bold text-[#E8C87A] underline decoration-[#C5A059]/50 decoration-1 underline-offset-2 hover:decoration-[#E8C87A] transition"
        >
          {m.text}
        </Link>,
      );
    } else if (m.kind === "heat") {
      nodes.push(
        <a
          key={`${keyPrefix}-heat-${i}`}
          href={TEAM_TEXTURE_URL}
          target="_blank"
          rel="noreferrer"
          className="font-bold text-[#E8C87A] underline decoration-[#C5A059]/50 decoration-1 underline-offset-2 hover:decoration-[#E8C87A] transition"
        >
          TT Heat Hat
        </a>,
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
  if (cursor < safeLine.length) {
    nodes.push(<span key={`${keyPrefix}-t-end`}>{safeLine.slice(cursor)}</span>);
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
  const sections = buildTipSections(why);

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
                {renderInline(action, "action", products)}
              </h3>
            )}

            {sections.length > 0 && (
              <>
                {/* Divider — dot + gradient rules, same motif as Home */}
                <div className="relative flex items-center my-4">
                  <div className="flex-grow h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <div className="mx-3 w-1 h-1 bg-[#C5A059] rounded-full shadow-[0_0_8px_#C5A059]" />
                  <div className="flex-grow h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>

                <div className="space-y-3">
                  {sections.map(({ label, Icon, body }, i) => (
                    <div key={`${label}-${i}`} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 space-y-2 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center size-7 rounded-full bg-[#C5A059]/15 border border-[#C5A059]/30 shrink-0">
                          <Icon className="size-3.5 text-[#C5A059]" />
                        </span>
                        <p className="text-[#C5A059] text-[9px] uppercase tracking-[0.22em] font-bold font-body">
                          {label}
                        </p>
                      </div>
                      <p className="text-[#E0D7CC]/90 text-[13px] leading-relaxed font-body break-words pl-9">
                        {renderInline(body, `p${i}`, products)}
                      </p>
                    </div>
                  ))}
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
