// Brand-side "reading the page" screen.
//
// Brands get two routes only: paste a link, or enter the details yourself.
// The link route calls the SAME edge function the member link flow calls
// (`product-analyse-url`) via the shared wrapper in src/lib/brandLinkScan.ts.
// There is no brand-specific scraper or image picker.
//
// On success we route to the shelf editor with a prefill, so the brand can
// check the read before sending it for review.

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { scanProductLink } from "@/lib/brandLinkScan";
import { toast } from "sonner";

interface NavState {
  mode: "link";
  position?: number;
  url?: string;
}

/** Surface the function's user-facing error string verbatim — Paige wrote it. */
const extractFunctionErrorMessage = async (err: unknown): Promise<string> => {
  const fallback = "Couldn't read that. Please try again.";
  const ctx = (err as { context?: { json?: unknown; text?: () => Promise<string> } })?.context;
  try {
    const json = ctx?.json as { error?: string } | undefined;
    if (json?.error) return json.error;
    if (typeof ctx?.text === "function") {
      const body = await ctx.text();
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed?.error) return parsed.error;
    }
  } catch {
    /* fall through */
  }
  const msg = err instanceof Error ? err.message : "";
  return msg || fallback;
};

const BrandProductScanning = () => {
  const nav = useNavigate();
  const location = useLocation();
  const state = (location.state as NavState | null) ?? null;

  const [phase, setPhase] = useState<"analysing" | "error">("analysing");
  const [error, setError] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("Opening the page…");
  const ranRef = useRef(false);

  // Rotating headline + gold ring — identical pacing to the member flow.
  useEffect(() => {
    if (phase !== "analysing") return;
    const sequence = [
      { at: 0, msg: "Opening the page…" },
      { at: 8000, msg: "Finding the ingredient list…" },
      { at: 20000, msg: "Reading the ingredients in order…" },
      { at: 34000, msg: "Cross-referencing the formula…" },
      { at: 48000, msg: "Almost there — writing it up…" },
    ];
    const timeouts = sequence.map(({ at, msg }) =>
      window.setTimeout(() => setLoadingMessage(msg), at),
    );
    const start = Date.now();
    const FAST_MS = 12000;
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct =
        elapsed <= FAST_MS
          ? (elapsed / FAST_MS) * 75
          : 75 + 24 * (1 - Math.exp(-(elapsed - FAST_MS) / 18000));
      setProgressPct((prev) => Math.max(prev, Math.min(99, pct)));
    }, 200);
    return () => {
      timeouts.forEach(window.clearTimeout);
      window.clearInterval(interval);
    };
  }, [phase]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (!state?.url) {
      nav("/brand/shelf", { replace: true });
      return;
    }

    void (async () => {
      try {
        const result = await scanProductLink(state.url!);

        setProgressPct(100);
        await new Promise((r) => setTimeout(r, 450));

        nav("/brand/shelf/new", {
          replace: true,
          state: {
            prefill: {
              name: result.name,
              description: result.description,
              ingredients: result.ingredients,
              ingredients_source: "link",
              source_type: "link",
              image_urls: result.image_urls,
              source_url: result.external_url,
              external_url: result.external_url,
              position: state.position ?? 0,
            },
          },
        });
      } catch (e) {
        const msg = await extractFunctionErrorMessage(e);
        console.error("[brand-link-scan] failed", e);
        setError(msg);
        setPhase("error");
        toast.error(msg);
      }
    })();
  }, [state, nav]);

  const SIZE = 132;
  const STROKE = 8;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - progressPct / 100);

  return (
    <ScreenLayout bottomNav={false}>
      <TitleBar title="Reading the page" back />
      <div className="px-5 pb-8 flex flex-col items-center text-center">
        {state?.url && (
          <SurfaceCard className="w-full p-3 mt-1">
            <p className="font-body text-[11.5px] text-muted-foreground break-all leading-snug">
              {state.url}
            </p>
          </SurfaceCard>
        )}

        {phase === "analysing" ? (
          <>
            <div className="mt-8 relative" style={{ width: SIZE, height: SIZE }}>
              <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke="hsl(var(--border))"
                  strokeWidth={STROKE}
                />
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={offset}
                  transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                  style={{ transition: "stroke-dashoffset 400ms ease-out" }}
                />
              </svg>
              <div
                className="absolute inset-0 flex items-center justify-center font-display text-primary"
                style={{ fontSize: 22 }}
                aria-live="polite"
              >
                {Math.round(progressPct)}%
              </div>
            </div>
            <p className="font-display text-lg mt-4">{loadingMessage}</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs">
              This can take up to a minute. Stay on this screen — we'll drop everything
              straight into the form for you to check.
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-lg mt-6 text-destructive">Couldn't read that</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-xs break-words">{error}</p>
            <div className="mt-5 max-w-xs text-left bg-card border border-border rounded-[12px] p-3 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-primary font-medium">
                For best results
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                • Use the product page itself, not a category or search page
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                • The page needs the full ingredient list visible in its text
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                • Pages behind a cookie wall or login can't be read
              </p>
            </div>
            <div className="mt-5 w-full max-w-xs space-y-2">
              <Button className="w-full rounded-pill" onClick={() => nav("/brand/shelf", { replace: true })}>
                Try again
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-pill"
                onClick={() =>
                  nav("/brand/shelf/new", {
                    replace: true,
                    state: {
                      prefill: {
                        source_url: state?.url,
                        external_url: state?.url,
                        position: state?.position ?? 0,
                      },
                    },
                  })
                }
              >
                Enter the details myself
              </Button>
            </div>
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default BrandProductScanning;
