import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyFontScale, getFontScale } from "./lib/fontScale";

// Apply the user's saved text size before React mounts so there's no flash
// of the default size on first paint.
applyFontScale(getFontScale());

// NOTE: this file used to monkey-patch Storage.prototype.removeItem and listen
// for cross-tab `storage` events so that ANY removal of a Supabase auth-token
// key wiped every `strand_*` key. That fired on transient events too — a failed
// token refresh, a refresh in a second tab, a PWA resume — so members lost their
// in-progress onboarding state and the app appeared to "glitch"/reset.
// Purging is now owned by AuthProvider and only happens on a confirmed sign-out
// or when a DIFFERENT user signs in on this device.


createRoot(document.getElementById("root")!).render(<App />);
