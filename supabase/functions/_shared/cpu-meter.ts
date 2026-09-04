// CPU HEADROOM MEASUREMENT (2026-09-04)
// =====================================
// Wall time told us a scan was slow. It did NOT tell us how close the isolate
// came to the edge worker's CPU limit — and that limit is what actually killed
// the stream ("CPU Time exceeded"). A scan that finishes at 95% of the CPU
// budget looks green on wall time and dies on the next slightly longer INCI
// panel.
//
// This module measures real CPU (user + system) consumed by the isolate for
// the request, via node:process.cpuUsage(), and expresses it as a percentage
// of the worker limit. It never throws and never affects the analysis: when the
// runtime doesn't expose cpuUsage the readings are simply null.

/**
 * Supabase edge worker per-request CPU allowance, in milliseconds.
 * Wall clock is far more generous; this is the one that kills isolates.
 */
export const WORKER_CPU_LIMIT_MS = 2_000;

export interface CpuMeter {
  /** CPU milliseconds (user + system) burned since the meter started. */
  cpuMs(): number | null;
  /** Same figure as a percentage of WORKER_CPU_LIMIT_MS, 1dp. */
  cpuPctOfLimit(): number | null;
}

type Usage = { user: number; system: number };

// deno-lint-ignore no-explicit-any
const cpuUsage = (): ((prev?: Usage) => Usage) | null => {
  try {
    // @ts-ignore — node compat shim, present on the Deno-based edge runtime.
    const proc = (globalThis as any).process;
    if (proc && typeof proc.cpuUsage === "function") {
      return (prev?: Usage) => proc.cpuUsage(prev) as Usage;
    }
  } catch { /* not available */ }
  return null;
};

const NULL_METER: CpuMeter = { cpuMs: () => null, cpuPctOfLimit: () => null };

export function startCpuMeter(): CpuMeter {
  const read = cpuUsage();
  if (!read) return NULL_METER;
  let base: Usage;
  try {
    base = read();
  } catch {
    return NULL_METER;
  }
  const cpuMs = () => {
    try {
      const d = read(base);
      return Math.round((d.user + d.system) / 1000);
    } catch {
      return null;
    }
  };
  return {
    cpuMs,
    cpuPctOfLimit: () => {
      const ms = cpuMs();
      if (ms === null) return null;
      return Math.round((ms / WORKER_CPU_LIMIT_MS) * 1000) / 10;
    },
  };
}
