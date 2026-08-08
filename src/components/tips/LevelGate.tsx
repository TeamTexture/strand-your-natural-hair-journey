import { ReactNode } from "react";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import type { TipsLevel } from "@/lib/tipsLevel";

/**
 * Renders its children only at or above a support level.
 * The single approved way to hide supporting detail — no page should compare
 * levels inline.
 *
 *  <LevelGate min={2}>…the concrete how-to…</LevelGate>
 *  <LevelGate min={3}>…the extended "why" paragraph, beginner detail…</LevelGate>
 *  <LevelGate max={2}>…standard list, replaced by the beginner guide at 3…</LevelGate>
 */
const LevelGate = ({
  min = 1,
  max = 3,
  children,
  fallback = null,
}: {
  min?: TipsLevel;
  max?: TipsLevel;
  children: ReactNode;
  fallback?: ReactNode;
}) => {
  const { level } = useTipsLevel();
  return <>{level >= min && level <= max ? children : fallback}</>;
};

export default LevelGate;
