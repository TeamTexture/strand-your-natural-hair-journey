// Personalised STRAND read on a TOOL the member owns or has wishlisted.
//
// Tools previously showed only the scraped generic description ("This is a heat
// styler designed to…"), which read as far weaker than the product guidance
// elsewhere in the app. This card reuses the SAME analysis path as products
// (`brand-product-guidance` via useBrandProductGuidance) so a tool gets the
// same personalised, manuscript-grounded reasoning: why it suits this member,
// how to use it for their hair, and what to be aware of — factual, educational,
// never alarmist. Grounding, scalp rules and citation checks live in that
// function and are untouched.

import { Check, Info, Sparkles } from "lucide-react";
import { useBrandProductGuidance } from "@/hooks/useBrandProductGuidance";
import { analysisSentences, analysisStrings, cleanAnalysisText } from "@/lib/toolAnalysis";
import type { UserTool } from "@/hooks/useUserTools";


/** Keep the personalised read to two or three sentences — never a paragraph. */
const trimToSentences = (text: string, max = 3) => {
  const parts = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]?/g) ?? [];
  return parts.slice(0, max).join(" ").trim();
};

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === "string") return x.trim();
      if (x && typeof x === "object") {
        const name = (x as Record<string, unknown>).name;
        return typeof name === "string" ? name.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
}

const ToolGuidanceCard = ({ tool, enabled = true }: { tool: UserTool; enabled?: boolean }) => {
  const analysis = (tool.ai_analysis ?? null) as Record<string, unknown> | null;
  const scrapedSummary =
    typeof analysis?.ai_summary === "string"
      ? (analysis.ai_summary as string)
      : typeof analysis?.summary === "string"
        ? (analysis.summary as string)
        : null;

  const { guidance } = useBrandProductGuidance(
    {
      id: `tool:${tool.id}`,
      name: tool.name,
      brand: tool.brand ?? null,
      description: scrapedSummary ?? tool.notes ?? null,
      kind: "tool",
      tool_kind: tool.category ?? null,
      external_url: tool.source_url ?? null,
      ingredients: [],
      key_features: stringArray(analysis?.key_features),
      materials: stringArray(analysis?.materials),
    },
    { enabled },
  );

  // The saved scan already holds a personalised read. Use it whenever the live
  // call has nothing to give (still loading, or unavailable) so the card never
  // sits on "Reading your profile…" with no copy behind it.
  const savedRead = trimToSentences(cleanAnalysisText(scrapedSummary) ?? "", 2) || null;
  const savedSteps = analysisSentences(analysis?.how_to_use, 3);
  const savedWatchOuts = analysisStrings(analysis?.warnings, 2);

  const liveRead = guidance
    ? trimToSentences(
        [validFitLine(guidance.fit_line), guidance.intro].filter(Boolean).join(" "),
      )
    : null;
  const read = hasFitContent(liveRead) ? liveRead : savedRead;
  const benefits = (guidance?.benefits ?? []).filter((b) => b?.label && b?.text);
  const steps = guidance?.steps?.length
    ? guidance.steps.filter(Boolean).slice(0, 3)
    : savedSteps;
  const watchOuts = guidance?.watch_outs?.length
    ? guidance.watch_outs.filter(Boolean).slice(0, 2)
    : savedWatchOuts;

  if (!read && !steps.length && !watchOuts.length) return null;

  return (
    <div className="rounded-[14px] border border-primary/20 bg-primary/[0.06] p-3 space-y-3">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-primary" />
        <p className="text-[10px] uppercase tracking-[0.16em] font-body text-primary">
          Your STRAND read
        </p>
      </div>

      {read && (
        <p className="text-[12.5px] font-body leading-relaxed text-foreground [overflow-wrap:anywhere]">
          {read}
        </p>
      )}


      {benefits.length > 0 && (
        <ul className="space-y-1.5 border-t border-primary/15 pt-2.5">
          {benefits.map((b) => (
            <li key={b.label} className="flex gap-2">
              <Check className="mt-[3px] size-3 shrink-0 text-primary" />
              <p className="text-[11.5px] font-body leading-snug text-foreground/85 [overflow-wrap:anywhere]">
                <span className="font-display text-[12.5px] text-foreground">{b.label}</span>
                {" — "}
                {b.text}
              </p>
            </li>
          ))}
        </ul>
      )}

      {steps.length > 0 && (
        <div className="border-t border-primary/15 pt-2.5">
          <p className="text-[10px] uppercase tracking-[0.16em] font-body text-muted-foreground">
            Using it on your hair
          </p>
          <ol className="mt-1.5 space-y-1.5">
            {steps.map((s, i) => (
              <li key={`${i}-${s.slice(0, 12)}`} className="flex gap-2">
                <span className="mt-[1px] text-[10.5px] font-body font-semibold text-primary">
                  {i + 1}
                </span>
                <p className="text-[11.5px] font-body leading-snug text-foreground/85 [overflow-wrap:anywhere]">
                  {s}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {watchOuts.length > 0 && (
        <div className="border-t border-primary/15 pt-2.5">
          <p className="text-[10px] uppercase tracking-[0.16em] font-body text-muted-foreground">
            Worth knowing
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {watchOuts.map((w) => (
              <li key={w.slice(0, 16)} className="flex gap-2">
                <Info className="mt-[3px] size-3 shrink-0 text-muted-foreground" />
                <p className="text-[11.5px] font-body leading-snug text-foreground/80 [overflow-wrap:anywhere]">
                  {w}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ToolGuidanceCard;
