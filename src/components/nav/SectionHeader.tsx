import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import Eyebrow from "@/components/nav/Eyebrow";

/**
 * SectionHeader — a section title with its mapped icon and, optionally, one
 * trailing action. Same tracked-caps eyebrow style as the rest of the app.
 */
const SectionHeader = ({
  icon,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex items-center justify-between gap-2 px-1", className)}>
    <Eyebrow icon={icon}>{children}</Eyebrow>
    {action}
  </div>
);

export default SectionHeader;
