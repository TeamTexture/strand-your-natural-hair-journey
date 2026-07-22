// Web App Badging API sync — pushes the current unread messages+alerts total
// onto the OS home-screen icon when the app is installed (iOS 16.4+ / most
// Android). Silently no-ops in ordinary browser tabs. Zero effect for users
// who haven't added STRAND to their home screen.
import { useEffect } from "react";

interface BadgingNavigator {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

export function useAppBadgeSync(unreadCount: number) {
  useEffect(() => {
    const nav = window.navigator as unknown as BadgingNavigator;
    if (!nav.setAppBadge) return; // Not installed / unsupported: no-op.
    if (unreadCount > 0) {
      nav.setAppBadge(unreadCount).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  }, [unreadCount]);
}
