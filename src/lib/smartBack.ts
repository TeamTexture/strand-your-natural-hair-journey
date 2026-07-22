// History-aware back navigation. Uses browser history when the current page
// was reached via in-app navigation, otherwise falls back to a sensible
// destination (deep link / fresh open case).
//
// Behaviour cap: after 2 consecutive back presses the user is sent to /home,
// so no matter how deep they are they're never more than two taps from the
// hub. Any forward navigation (link, button, programmatic push) resets the
// counter so the two-back window always tracks the *current* drill-down.
import type { NavigateFunction } from "react-router-dom";

const HISTORY_ENTRY_KEY = "strand.hasInAppHistory";
const BACK_COUNT_KEY = "strand.backCount";
const HOME_PATH = "/home";
const MAX_CONSECUTIVE_BACKS = 2;

/** Mark that we've navigated at least once inside the app this session. */
export const markInAppHistory = () => {
  sessionStorage.setItem(HISTORY_ENTRY_KEY, "1");
};

/** Reset the consecutive-back counter (call on any forward navigation). */
export const resetBackCount = () => {
  sessionStorage.removeItem(BACK_COUNT_KEY);
};

// Flag set for one tick when smartBack triggers navigation, so the location
// tracker doesn't treat that pop as a fresh forward navigation.
let popInFlight = false;
export const isBackPopInFlight = () => popInFlight;

/**
 * Go back if in-app history exists, otherwise navigate to fallback.
 * After two consecutive back presses we jump straight to /home.
 */
export const smartBack = (
  navigate: NavigateFunction,
  fallback: string,
): (() => void) => {
  return () => {
    const hasHistory =
      sessionStorage.getItem(HISTORY_ENTRY_KEY) === "1" && window.history.length > 1;

    const nextCount = Number(sessionStorage.getItem(BACK_COUNT_KEY) ?? "0") + 1;

    popInFlight = true;
    setTimeout(() => {
      popInFlight = false;
    }, 0);

    if (nextCount >= MAX_CONSECUTIVE_BACKS) {
      resetBackCount();
      navigate(HOME_PATH);
      return;
    }

    sessionStorage.setItem(BACK_COUNT_KEY, String(nextCount));

    if (hasHistory) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };
};
