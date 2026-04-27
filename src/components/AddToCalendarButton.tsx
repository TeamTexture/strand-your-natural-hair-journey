import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { addToCalendar, type CalendarEvent } from "@/lib/addToCalendar";
import { cn } from "@/lib/utils";

interface Props {
  event: CalendarEvent;
  /** "chip" (small inline pill) or "full" (full width pill button). Default: chip. */
  variant?: "chip" | "full";
  className?: string;
  label?: string;
}

const AddToCalendarButton = ({
  event,
  variant = "chip",
  className,
  label = "Add to Calendar",
}: Props) => {
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      addToCalendar(event);
      toast.success("Calendar event ready", {
        description: "Open the downloaded file to add it to your calendar.",
      });
    } catch (err) {
      console.error("addToCalendar failed", err);
      toast.error("Could not create calendar event");
    }
  };

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-pill",
          "bg-secondary border border-border text-foreground text-sm font-medium",
          "hover:bg-primary/10 hover:border-primary/40 transition-colors min-h-[48px]",
          className,
        )}
      >
        <CalendarPlus className="size-4" />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
        "bg-primary/10 text-primary text-[11px] font-medium",
        "hover:bg-primary/20 transition-colors min-h-[32px]",
        className,
      )}
      aria-label={label}
    >
      <CalendarPlus className="size-3.5" />
      Add to Calendar
    </button>
  );
};

export default AddToCalendarButton;
