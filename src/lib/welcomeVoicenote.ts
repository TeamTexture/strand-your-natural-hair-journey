// "Listened" state for the one-off STRAND welcome voice note.
//
// The welcome popup used to burn a `shown` flag the moment it appeared, so the
// popup dismissed ITSELF on the very next render — the member saw a flash and
// the message was gone. Visibility is now driven by whether she has actually
// PLAYED the voice note, recorded here, plus a per-session "minimise" snooze so
// it can be put aside without being lost.
//
// Chat's own `read_at` deliberately does NOT clear it: opening the thread marks
// messages read, which is not the same as having listened.

const listenedKey = (uid: string, id: string) => `strand_welcome_vn_listened_${uid}_${id}`;
const snoozeKey = (uid: string) => `strand.welcomeVoicenote.snoozed.${uid}`;

export function hasListenedToWelcome(uid: string | undefined, id: string | undefined): boolean {
  if (!uid || !id) return false;
  try {
    return localStorage.getItem(listenedKey(uid, id)) === "1";
  } catch {
    return false;
  }
}

export function markWelcomeListened(uid: string | undefined, id: string | undefined): void {
  if (!uid || !id) return;
  try {
    localStorage.setItem(listenedKey(uid, id), "1");
  } catch {
    /* private mode */
  }
}

/** Minimise = "not right now": hidden for this session, back on the next open. */
export function isWelcomeSnoozed(uid: string | undefined): boolean {
  if (!uid) return false;
  try {
    return sessionStorage.getItem(snoozeKey(uid)) === "1";
  } catch {
    return false;
  }
}

export function snoozeWelcome(uid: string | undefined): void {
  if (!uid) return;
  try {
    sessionStorage.setItem(snoozeKey(uid), "1");
  } catch {
    /* private mode */
  }
}
