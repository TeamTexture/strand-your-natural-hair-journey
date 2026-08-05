// History-aware back navigation. Back ALWAYS returns to the page the user was
// just on when a real in-app history entry exists; otherwise it falls back to a
// sensible destination (deep link / fresh open case).
import type { NavigateFunction } from "react-router-dom";

const HISTORY_ENTRY_KEY = "strand.hasInAppHistory";
const BACK_COUNT_KEY = "strand.backCount";
const HOME_PATH = "/home";

/** Mark that we've navigated at least once inside the app this session. */
export const markInAppHistory = () => {
  sessionStorage.setItem(HISTORY_ENTRY_KEY, "1");
};

/** Kept for compatibility with the history tracker. */
export const resetBackCount = () => {
  sessionStorage.removeItem(BACK_COUNT_KEY);
};

// Flag set for one tick when smartBack triggers navigation, so the location
// tracker doesn't treat that pop as a fresh forward navigation.
let popInFlight = false;
export const isBackPopInFlight = () => popInFlight;

/** True when react-router has a real previous entry in this SPA session. */
const hasRouterHistory = (): boolean => {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  return idx > 0 && sessionStorage.getItem(HISTORY_ENTRY_KEY) === "1";
};

/**
 * Go back one step in history when possible, otherwise navigate to fallback.
 * Never short-circuits to /home — the user returns to where they came from.
 */
export const smartBack = (
  navigate: NavigateFunction,
  fallback: string,
): (() => void) => {
  return () => {
    popInFlight = true;
    setTimeout(() => {
      popInFlight = false;
    }, 0);

    if (hasRouterHistory()) {
      navigate(-1);
    } else {
      // Backwards moves must never push a new entry, otherwise the browser
      // back button returns to the page we just left (loop).
      navigate(fallback, { replace: true });
    }
  };
};


/**
 * Always-functional back. Pops history only when there is a real previous
 * entry inside this SPA session; otherwise navigates to the fallback so the
 * button is never a dead tap.
 */
export const safeBack = (
  navigate: NavigateFunction,
  fallback: string = HOME_PATH,
) => {
  if (hasRouterHistory()) {
    navigate(-1);
  } else {
    // Fallback is a *backwards* move — replace so we don't stack history.
    navigate(fallback, { replace: true });
  }
};


