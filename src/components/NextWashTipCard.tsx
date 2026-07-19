import { Sparkles } from "lucide-react";

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

/**
 * Editorial dark card that matches the "Current style" block on Home.
 * Used everywhere the AI "Tip for your next wash day" surfaces so the
 * hierarchy on Home / Wash Day Hub / Wash Day Detail / Wash Step 4 is
 * visually consistent.
 */
export function NextWashTipCard({
  action,
  why,
  headerRight,
  footer,
  collapsed = false,
}: NextWashTipCardProps) {
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

            {why && (
              <>
                {/* Divider — dot + gradient rules, same motif as Home */}
                <div className="relative flex items-center my-4">
                  <div className="flex-grow h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <div className="mx-3 w-1 h-1 bg-[#C5A059] rounded-full shadow-[0_0_8px_#C5A059]" />
                  <div className="flex-grow h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>

                <p className="text-[#C5A059] text-[9px] uppercase tracking-[0.2em] mb-2 font-bold font-body">
                  Why it matters
                </p>
                <p className="text-[#E0D7CC]/90 text-[13px] leading-relaxed font-body break-words">
                  {why}
                </p>
              </>
            )}
          </>
        )}

        {footer && <div className="mt-5">{footer}</div>}
      </div>
    </div>
  );
}
