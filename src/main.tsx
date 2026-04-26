import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

declare global {
  interface Window {
    __strandAuthPurgeInstalled?: boolean;
  }
}

const STRAND_AUTH_TOKEN_PREFIX = "sb-";
const STRAND_AUTH_TOKEN_SUFFIX = "-auth-token";
const STRAND_BOOT_PRESERVED_KEYS = new Set([
  "strand_walkthrough_complete",
  "strand_migration_v1_done",
  "strand_migration_v1_user_id",
]);

const isAuthTokenKey = (key: unknown): key is string =>
  typeof key === "string" &&
  key.startsWith(STRAND_AUTH_TOKEN_PREFIX) &&
  key.endsWith(STRAND_AUTH_TOKEN_SUFFIX);

const purgeStrandKeysAtBoot = (source: string) => {
  if (typeof window === "undefined") return;

  Object.keys(localStorage).forEach((key) => {
    if (!key.startsWith("strand_")) return;
    if (STRAND_BOOT_PRESERVED_KEYS.has(key)) return;
    localStorage.removeItem(key);
  });

  console.log(`[strand] purged via ${source}`);
};

if (typeof window !== "undefined" && !window.__strandAuthPurgeInstalled) {
  window.__strandAuthPurgeInstalled = true;

  window.addEventListener("storage", (event) => {
    if (isAuthTokenKey(event.key) && !event.newValue) {
      purgeStrandKeysAtBoot("storage event");
    }
  });

  const originalRemoveItem = Storage.prototype.removeItem;
  Storage.prototype.removeItem = function removeItemWithStrandPurge(key: string) {
    const result = originalRemoveItem.call(this, key);

    if (this === localStorage && isAuthTokenKey(key)) {
      purgeStrandKeysAtBoot("localStorage.removeItem");
    }

    return result;
  };
}

createRoot(document.getElementById("root")!).render(<App />);
