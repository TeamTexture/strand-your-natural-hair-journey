/**
 * iOS-style status bar shown at the top of every screen (except splash).
 * 9:41 left, signal/wifi/battery icons right.
 *
 * Respects safe-area-inset-top so it sits below the iPhone notch on real devices.
 */
const StatusBar = () => (
  <div
    className="px-6 flex items-center justify-between text-foreground text-[15px] font-semibold font-body shrink-0 select-none"
    style={{
      paddingTop: "max(env(safe-area-inset-top), 0px)",
      height: "calc(44px + env(safe-area-inset-top))",
    }}
  >
    <span>9:41</span>
    <div className="flex items-center gap-1.5">
      {/* signal */}
      <svg width="18" height="11" viewBox="0 0 18 11" fill="none" aria-hidden="true">
        <rect x="0" y="7" width="3" height="4" rx="0.5" fill="currentColor" />
        <rect x="5" y="5" width="3" height="6" rx="0.5" fill="currentColor" />
        <rect x="10" y="2" width="3" height="9" rx="0.5" fill="currentColor" />
        <rect x="15" y="0" width="3" height="11" rx="0.5" fill="currentColor" />
      </svg>
      {/* wifi */}
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none" aria-hidden="true">
        <path d="M8 11a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4zM3 6.5C4.4 5 6.1 4.2 8 4.2s3.6.8 5 2.3l-1.2 1.2C10.7 6.6 9.4 6 8 6s-2.7.6-3.8 1.7L3 6.5zM0 3.5C2.2 1.4 5 .2 8 .2s5.8 1.2 8 3.3l-1.2 1.2C12.9 2.9 10.5 1.9 8 1.9s-4.9 1-6.8 2.8L0 3.5z" fill="currentColor" />
      </svg>
      {/* battery */}
      <svg width="26" height="12" viewBox="0 0 26 12" fill="none" aria-hidden="true">
        <rect x="0.5" y="0.5" width="22" height="11" rx="2.5" stroke="currentColor" opacity="0.4" />
        <rect x="2" y="2" width="19" height="8" rx="1.5" fill="currentColor" />
        <rect x="23.5" y="4" width="2" height="4" rx="1" fill="currentColor" opacity="0.4" />
      </svg>
    </div>
  </div>
);

export default StatusBar;
