import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/hooks/useViewAs";
import { cn } from "@/lib/utils";

/**
 * Drop-in "View as user" action for any admin card that shows a member,
 * professional or brand owner. Same behaviour as the /admin/view-as list:
 * read-only impersonation, exited from the sticky banner.
 */
const ViewAsUserButton = ({
  userId,
  name,
  className,
}: {
  userId: string;
  name?: string | null;
  className?: string;
}) => {
  const { actualUser } = useAuth();
  const { startViewAs, stopViewAs } = useViewAs();
  const qc = useQueryClient();
  const nav = useNavigate();

  if (!userId || userId === actualUser?.id) return null;

  const enter = () => {
    stopViewAs();
    startViewAs(userId, name?.trim() || "user");
    qc.clear();
    nav("/home");
  };

  return (
    <button
      type="button"
      onClick={enter}
      className={cn(
        "w-full inline-flex items-center justify-center gap-2 rounded-pill border border-border bg-background px-3 py-2 text-[12px] font-body font-medium text-foreground",
        className,
      )}
    >
      <Eye className="size-3.5" />
      View as user
    </button>
  );
};

export default ViewAsUserButton;
