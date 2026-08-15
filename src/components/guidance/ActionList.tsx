import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import { useSmartInline } from "@/lib/smartInline";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { plainLanguage } from "@/components/beginner/BeginnerGuide";
import { guidanceIcon } from "@/lib/guidance";
import KeyFactChips from "@/components/guidance/KeyFactChips";

export interface GuidanceAction {
  /** The instruction — always shown. */
  action: string;
  /** The reasoning — shown from level 3 up. */
  why?: string;
  /** Plain-English definition of a technical term (level 3). */
  define?: string;
}

/**
 * ActionRow — an icon-led action row. A circular icon chip matched to the
 * wording, the action as the bold line, and the "why" as lighter supporting
 * text beneath. Replaces plain "·" bullets everywhere guidance renders.
 */
export const ActionRow = ({
  action,
  why,
  define,
  showWhy = true,
  showChips = false,
  keyPrefix = "act",
  className,
}: GuidanceAction & {
  showWhy?: boolean;
  showChips?: boolean;
  keyPrefix?: string;
  className?: string;
}) => {
  const render = useSmartInline();
  const { showBeginnerHelp } = useTipsLevel();
  const Icon = guidanceIcon(action);
  const body = showBeginnerHelp ? plainLanguage(action) : action;
  const reason = why ? (showBeginnerHelp ? plainLanguage(why) : why) : undefined;

  return (
    <div className={cn("flex items-start gap-3 min-h-[44px]", className)}>
      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/12">
        <Icon className="size-4 text-primary" aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold leading-snug text-foreground break-words [overflow-wrap:anywhere] font-body">
          {render(body, `${keyPrefix}-a`)}
        </p>
        {showWhy && reason && (
          <p className="mt-1 text-[12px] leading-[1.6] text-muted-foreground break-words [overflow-wrap:anywhere] font-body">
            {render(reason, `${keyPrefix}-w`)}
          </p>
        )}
        {define && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
            <Info className="size-3.5 text-primary shrink-0 mt-[1px]" aria-hidden />
            <span>{define}</span>
          </p>
        )}
        {showChips && <KeyFactChips className="mt-2" text={`${body} ${reason ?? ""}`} max={3} />}
      </div>
    </div>
  );
};

/** ActionList — a stack of ActionRows with hairline separators. */
const ActionList = ({
  actions,
  showWhy = true,
  showChips = false,
  idPrefix = "action",
  className,
}: {
  actions: GuidanceAction[];
  showWhy?: boolean;
  showChips?: boolean;
  idPrefix?: string;
  className?: string;
}) => {
  if (actions.length === 0) return null;
  return (
    <ul className={cn("divide-y divide-border/60", className)}>
      {actions.map((a, i) => (
        <li key={`${idPrefix}-${i}`} className="py-2.5 first:pt-0 last:pb-0">
          <ActionRow
            {...a}
            showWhy={showWhy}
            showChips={showChips}
            keyPrefix={`${idPrefix}-${i}`}
          />
        </li>
      ))}
    </ul>
  );
};

export default ActionList;
