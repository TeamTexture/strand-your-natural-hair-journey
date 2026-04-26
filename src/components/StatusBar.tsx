/**
 * Spacer that respects iOS safe-area-inset-top so content sits below the
 * notch on real devices. The fake clock/wifi/battery row was removed —
 * the real device chrome handles that.
 */
const StatusBar = () => (
  <div
    className="shrink-0"
    style={{
      height: "max(env(safe-area-inset-top), 0px)",
    }}
    aria-hidden="true"
  />
);

export default StatusBar;
