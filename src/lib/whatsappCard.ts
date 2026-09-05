// Remembers whether the Home WhatsApp card is minimised, per member, for good.
// Stored under the purged `strand_` namespace so it survives sign-out/sign-in
// on the same device but never leaks between accounts.

const key = (userId: string) => `strand_whatsapp_card_minimised_${userId}`;

export const isWhatsAppCardMinimised = (userId: string | undefined) => {
  if (!userId) return false;
  try {
    return localStorage.getItem(key(userId)) === "1";
  } catch {
    return false;
  }
};

export const setWhatsAppCardMinimised = (userId: string | undefined, minimised: boolean) => {
  if (!userId) return;
  try {
    localStorage.setItem(key(userId), minimised ? "1" : "0");
  } catch {
    /* private mode / quota — the card simply reopens expanded */
  }
};
