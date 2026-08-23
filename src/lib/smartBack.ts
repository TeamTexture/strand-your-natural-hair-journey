// History-aware back navigation.
//
// We keep our own stack of in-app entries (path + router history index) in
// sessionStorage. Back always returns to the previous DISTINCT page the user
// actually saw — never /home by force, and never a loop between two pages.
import type { NavigateFunction } from "react-router-dom";

const STACK_KEY = "strand.navStack";
const HOME_PATH = "/home";

type Entry = { path: string; idx: number };

const routerIdx = (): number =>
  (window.history.state as { idx?: number } | null)?.idx ?? 0;

/**
 * The home surface for the view the member is actually in. A professional,
 * admin or brand account must never be dropped onto the consumer home by a
 * back button, so the "/home" fallback resolves against the same active-view
 * value the global menu keeps (`strand.lastRoleView`).
 */
const viewHome = (): string => {
  try {
    switch (sessionStorage.getItem("strand.lastRoleView")) {
      case "pro":
        return "/pro";
      case "admin":
        return "/admin";
      case "brand":
        return "/brand";
      default:
        return HOME_PATH;
    }
  } catch {
    return HOME_PATH;
  }
};

/** Resolve a fallback route, redirecting a generic home to the active view. */
const resolveFallback = (fallback: string): string =>
  fallback === HOME_PATH ? viewHome() : fallback;


const readStack = (): Entry[] => {
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    const parsed = raw ? (JSON.parse(raw) as Entry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStack = (stack: Entry[]) => {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-40)));
  } catch {
    /* ignore */
  }
};

/**
 * Record the current location. Handles all three navigation kinds:
 * - push  (idx grows)      → append
 * - replace (idx same)     → overwrite the top entry
 * - pop   (idx shrinks)    → truncate forward entries
 * Consecutive duplicates of the same path collapse so back never no-ops.
 */
export const recordLocation = (path: string) => {
  const idx = routerIdx();
  let stack = readStack().filter((e) => e.idx < idx);
  const top = stack[stack.length - 1];
  if (top && top.path === path) {
    // Same page re-entered (redirect loop) — keep the earlier entry.
    stack = stack.slice(0, -1);
  }
  stack.push({ path, idx });
  writeStack(stack);
};

/** Legacy names kept so existing imports keep working. */
export const markInAppHistory = () => {
  recordLocation(window.location.pathname + window.location.search);
};
export const resetBackCount = () => {};
export const isBackPopInFlight = () => false;

const previousEntry = (): Entry | null => {
  const stack = readStack();
  const currentPath = window.location.pathname + window.location.search;
  // Walk backwards past any entries matching the current page.
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].path !== currentPath) return stack[i];
  }
  return null;
};

const goBack = (navigate: NavigateFunction, fallback: string) => {
  const prev = previousEntry();
  const idx = routerIdx();

  if (prev) {
    const delta = prev.idx - idx;
    if (delta < 0) {
      // Drop the entries we're leaving behind so the next back is correct.
      writeStack(readStack().filter((e) => e.idx <= prev.idx));
      navigate(delta);
      return;
    }
    // Same/unknown index (session restored) — go there without stacking.
    writeStack(readStack().filter((e) => e.idx < idx));
    navigate(prev.path, { replace: true });
    return;
  }

  // No in-app history (deep link / fresh open) — backwards move, so replace.
  navigate(resolveFallback(fallback), { replace: true });
};


/** Curried variant for `onBack={smartBack(navigate, "/x")}`. */
export const smartBack = (navigate: NavigateFunction, fallback: string) => () =>
  goBack(navigate, fallback);

/** Imperative variant. */
export const safeBack = (
  navigate: NavigateFunction,
  fallback: string = HOME_PATH,
) => goBack(navigate, fallback);
