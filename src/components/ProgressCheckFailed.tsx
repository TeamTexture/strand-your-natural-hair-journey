/**
 * Shown when the onboarding-progress read fails.
 *
 * A dropped request must never be read as "this member has no data" — that is
 * what sent finished members back to step one and looked like lost answers.
 */
const ProgressCheckFailed = ({ onRetry }: { onRetry?: () => void }) => (
  <div className="flex-1 flex items-center justify-center px-6 py-10 bg-background">
    <div className="w-full max-w-[300px] rounded-lg border border-border bg-card p-5 text-center">
      <h1 className="font-display text-lg text-foreground">We couldn't check your progress</h1>
      <p className="mt-2 text-[13px] leading-snug text-muted-foreground font-body">
        Your answers are still saved. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={() => (onRetry ? onRetry() : window.location.reload())}
        className="mt-4 w-full min-h-[44px] rounded-pill bg-primary text-primary-foreground text-sm font-body"
      >
        Try again
      </button>
    </div>
  </div>
);

export default ProgressCheckFailed;
