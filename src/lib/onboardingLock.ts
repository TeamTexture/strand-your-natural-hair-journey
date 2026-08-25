// Back-navigation pinning for the locked onboarding state.
//
// While a member still owes any of the three required pieces (hair
// characteristics, blood work, professional consultation) she lives on the
// pick-up-where-you-left-off screen. Back from that screen — or from any
// sub-flow reached from it — must land on the resume screen, never walk her
// back through the original step 1-9 onboarding history.
//
// The lock is a stored flag set by the resume screen itself (the only place
// that knows the outstanding requirements) and cleared the moment the data set
// is complete. It lives in localStorage so it survives a fresh tab, a reload or
// a new sign-in on the same device — the lock must not quietly lift just
// because the member opened the app again.

const LOCK_KEY = "strand.resumeLock";

export const RESUME_PATH = "/onboarding/resume";

export const setResumeLock = () => {
  try {
    localStorage.setItem(LOCK_KEY, "1");
  } catch {
    /* ignore */
  }
};

export const clearResumeLock = () => {
  try {
    localStorage.removeItem(LOCK_KEY);
    sessionStorage.removeItem(LOCK_KEY);
  } catch {
    /* ignore */
  }
};

export const isResumeLocked = (): boolean => {
  try {
    return localStorage.getItem(LOCK_KEY) === "1" || sessionStorage.getItem(LOCK_KEY) === "1";
  } catch {
    return false;
  }
};


/**
 * The sub-flows reachable from the resume screen. Back inside a group still
 * steps between that group's own screens (blood minerals → iron, for example);
 * back that would leave the group is pinned to the resume screen.
 */
const GROUPS: string[][] = [
  // pro-details sits in the hair group as well as the professional group: the
  // consultation record and the markers are one continuous flow now, so back
  // from the markers form steps to the consultation it came from rather than
  // bouncing off the resume screen.
  [
    "/onboarding/pro-details",
    "/onboarding/profile-step-3-hair",
    "/onboarding/profile-step-4-colour",
  ],
  [
    "/onboarding/blood-timing",
    "/blood-upload",
    "/onboarding/blood-iron-vitamins",
    "/onboarding/blood-minerals",
    "/onboarding/blood-thyroid",
    "/onboarding/blood-hormones",
  ],
  ["/onboarding/pro-details", "/onboarding/pro-book", "/directory"],
];

const pathOnly = (p: string) => p.split("?")[0];

const groupOf = (path: string): string[] | null =>
  GROUPS.find((g) => g.includes(pathOnly(path))) ?? null;

/** Is this path allowed while the resume lock is on? */
export const isAllowedWhileLocked = (path: string): boolean =>
  pathOnly(path) === RESUME_PATH || !!groupOf(path);

/**
 * Where back should go from `current` while locked, or null to let the normal
 * back behaviour run (a step within the same sub-flow).
 *
 * Returns RESUME_PATH whenever the intended previous page would leave the
 * sub-flow, and "" (stay put) when already on the resume screen.
 */
export const pinnedBackTarget = (current: string, intendedPrev?: string | null): string | null => {
  if (!isResumeLocked()) return null;
  if (pathOnly(current) === RESUME_PATH) return "";
  const group = groupOf(current);
  if (!group) return RESUME_PATH;
  if (intendedPrev && group.includes(pathOnly(intendedPrev))) return null;
  return RESUME_PATH;
};
