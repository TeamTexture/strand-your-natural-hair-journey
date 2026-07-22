// History-aware back navigation. Uses browser history when the current page
// was reached via in-app navigation, otherwise falls back to a sensible
// destination (deep link / fresh open case).
import type { NavigateFunction } from "react-router-dom";

const HISTORY_ENTRY_KEY = "strand.hasInAppHistory";

/** Mark that we've navigated at least once inside the app this session. */
export const markInAppHistory = () => {
  sessionStorage.setItem(HISTORY_ENTRY_KEY, "1");
};

/**
 * Go back if in-app history exists, otherwise navigate to fallback.
 * Use inside onBack handlers so users never get bounced to an arbitrary
 * hub when the actual previous page is right there in history.
 */
export const smartBack = (
  navigate: NavigateFunction,
  fallback: string,
): (() => void) => {
  return () => {
    const hasHistory =
      sessionStorage.getItem(HISTORY_ENTRY_KEY) === "1" && window.history.length > 1;
    if (hasHistory) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };
};
