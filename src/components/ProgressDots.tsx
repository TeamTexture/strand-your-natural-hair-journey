interface Props {
  total: number;
  current: number; // 1-indexed
}

const ProgressDots = ({ total, current }: Props) => (
  <div className="flex items-center justify-center gap-2 py-3" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current}>
    {Array.from({ length: total }).map((_, i) => {
      const active = i + 1 === current;
      const past = i + 1 < current;
      return (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            active ? "w-6 bg-primary" : past ? "w-1.5 bg-primary/60" : "w-1.5 bg-border"
          }`}
        />
      );
    })}
  </div>
);

export default ProgressDots;
