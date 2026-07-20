import { Sparkles } from "lucide-react";
import { useSmartInline, normaliseHeatLanguage } from "@/lib/smartInline";

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

const LABELS = [
  "Your signal",
  "Your focus",
  "What to prioritise",
  "Why it matters",
  "Why this matters",
  "How to use it",
  "How to use",
  "How it helps",
  "Watch out for",
  "Watch out",
  "Watch for",
  "Best paired with",
  "Best sources",
  "Try this",
  "Do this next wash",
  "The action",
  "The rationale",
  "Product consistency",
  "Strand tip",
  "Note",
];

const LABEL_RE = new RegExp(`\\*{0,2}\\b(${LABELS.join("|")})\\b\\*{0,2}\\s*:\\*{0,2}`, "gi");

const LABEL_TONE: Record<string, { dot: string; label: string }> = {
  "what to prioritise": { dot: "bg-primary", label: "text-primary" },
  "why it matters": { dot: "bg-good", label: "text-good" },
  "why this matters": { dot: "bg-good", label: "text-good" },
  "how to use it": { dot: "bg-good", label: "text-good" },
  "how to use": { dot: "bg-good", label: "text-good" },
  "how it helps": { dot: "bg-good", label: "text-good" },
  "watch out for": { dot: "bg-destructive", label: "text-destructive" },
  "watch out": { dot: "bg-destructive", label: "text-destructive" },
  "watch for": { dot: "bg-destructive", label: "text-destructive" },
  "best paired with": { dot: "bg-good", label: "text-good" },
  "best sources": { dot: "bg-good", label: "text-good" },
  "try this": { dot: "bg-primary", label: "text-primary" },
  "do this next wash": { dot: "bg-primary", label: "text-primary" },
  "the action": { dot: "bg-primary", label: "text-primary" },
  "the rationale": { dot: "bg-good", label: "text-good" },
  "product consistency": { dot: "bg-primary", label: "text-primary" },
  "strand tip": { dot: "bg-primary", label: "text-primary" },
  note: { dot: "bg-muted-foreground", label: "text-muted-foreground" },
};

const DISPLAY_LABEL: Record<string, string> = {
  "your signal": "Why it matters",
  "your focus": "What to prioritise",
  "watch out": "Watch out for",
  "watch for": "Watch out for",
};

const normaliseText = (raw: string): string => {
  let t = String(raw ?? "");
  t = t.replace(/\\n/g, "\n").replace(/\/n\/n/g, "\n\n").replace(/\/n/g, "\n");
  t = normaliseHeatLanguage(t);
  t = t.replace(LABEL_RE, (_m, lbl) => `\n\n${lbl}:`);
  return t.replace(/\n{3,}/g, "\n\n").trim();
};

interface RichBodyProps {
  text: string;
  className?: string;
  strandTipLast?: boolean;
}

const RichBody = ({ text, className = "", strandTipLast = false }: RichBodyProps) => {
  const raw = normaliseText(text);
  let paras = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length <= 1 && raw.length > 220) {
    paras = chunkSentences(raw, 2);
  } else {
    paras = paras.flatMap((p) => (p.length > 260 ? chunkSentences(p, 2) : [p]));
  }

  const renderInline = (line: string, keyPrefix: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        return (
          <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={`${keyPrefix}-t-${i}`}>{part}</span>;
    });
  };

  let tipPara: string | null = null;
  if (strandTipLast && paras.length > 1) {
    const lastIdx = paras.length - 1;
    const last = paras[lastIdx];
    const isLabelled = /^([A-Z][A-Za-z ]{2,24}):/.test(last);
    if (!isLabelled && last.length <= 320) {
      tipPara = last.replace(/^(?:Tip|Strand tip):\s*/i, "");
      paras = paras.slice(0, lastIdx);
    }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {paras.map((p, i) => {
        const m = p.match(/^([A-Z][A-Za-z ]{2,24}):\s*([\s\S]*)$/);
        const key = m?.[1]?.toLowerCase().trim();
        const displayLabel = key ? DISPLAY_LABEL[key] ?? m?.[1] : undefined;
        const toneKey = key === "your signal" ? "why it matters" : key === "your focus" ? "what to prioritise" : key;
        const tone = toneKey ? LABEL_TONE[toneKey] : undefined;
        if (m && tone) {
          return (
            <div key={i} className="relative pl-3">
              <span className={`absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full ${tone.dot}`} />
              <p className={`text-[10px] uppercase tracking-[0.16em] font-semibold ${tone.label}`}>
                {displayLabel}
              </p>
              <p className="mt-1 text-xs text-foreground/85 font-body leading-relaxed">
                {renderInline(m[2], `p${i}`)}
              </p>
            </div>
          );
        }
        return (
          <p key={i} className="text-xs text-foreground/85 font-body leading-relaxed">
            {renderInline(p, `p${i}`)}
          </p>
        );
      })}
      {tipPara && (
        <div className="mt-1 rounded-lg border-2 border-primary/70 bg-primary/[0.06] px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-primary" aria-hidden />
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-primary">
              Strand tip
            </p>
          </div>
          <p className="mt-1 text-xs text-foreground/90 font-body leading-relaxed">
            {renderInline(tipPara, "tip")}
          </p>
        </div>
      )}
    </div>
  );
};

export default RichBody;