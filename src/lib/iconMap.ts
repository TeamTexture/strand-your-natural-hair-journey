import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Droplets,
  Flame,
  FlaskConical,
  Gauge,
  HeartPulse,
  Layers,
  NotebookPen,
  Package,
  Ruler,
  Scissors,
  Sparkles,
  Stethoscope,
  Target,
  Thermometer,
  User,
  Wind,
  type LucideIcon,
} from "lucide-react";

/**
 * ICON MEANING MAP — one icon per concept, app-wide. Import from here rather
 * than picking an icon per screen so the same idea always looks the same.
 */
export const ICONS = {
  washDay: Droplets,
  journal: NotebookPen,
  goal: Target,
  length: Ruler,
  blood: Activity,
  health: HeartPulse,
  clinical: Stethoscope,
  products: Package,
  ingredients: FlaskConical,
  style: Sparkles,
  trim: Scissors,
  porosity: Droplets,
  density: Layers,
  scalp: Wind,
  hairType: Layers,
  heat: Thermometer,
  calendar: CalendarDays,
  profile: User,
  breakage: AlertTriangle,
  duration: Clock,
  stress: Gauge,
  clean: CheckCircle2,
  heatTool: Flame,
} satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof ICONS;
