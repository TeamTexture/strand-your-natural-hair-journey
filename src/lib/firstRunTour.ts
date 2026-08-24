/**
 * Shared state for the first-run guided tour and the prompts that follow it.
 *
 * The tour itself is gated on the database (`profiles.home_tour_seen_at`, via
 * useFirstRunNudge). These localStorage keys only carry short-lived intent
 * between screens: "the member tapped START HERE, so open the tour when Home
 * mounts" and "the tour has finished, so the goals gate may run".
 */
const AUTOSTART_KEY = "strand_tour_autostart";
const DONE_KEY = "strand_tour_finished_v1";

export const TOUR_DONE_EVENT = "strand:tour-finished";
export const TOUR_START_EVENT = "strand:start-tour";

const read = (key: string) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const write = (key: string, on: boolean) => {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
};

/** Set when the member taps the glowing START HERE beacon on the Home tab. */
export const requestTourAutostart = () => write(AUTOSTART_KEY, true);
export const consumeTourAutostart = (): boolean => {
  const on = read(AUTOSTART_KEY);
  if (on) write(AUTOSTART_KEY, false);
  return on;
};

/** True once the tour has been completed or skipped. */
export const tourFinished = () => read(DONE_KEY);
export const markTourFinished = () => {
  write(DONE_KEY, true);
  window.dispatchEvent(new Event(TOUR_DONE_EVENT));
};
