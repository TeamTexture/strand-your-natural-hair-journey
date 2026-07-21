import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Eye, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/hooks/useViewAs";

/**
 * Sticky admin banner rendered above every route when "View as user" is
 * active. Makes the mode unmissable so admins never forget they're seeing
 * another person's data, and gives them a one-tap exit.
 */
const ViewAsBanner = () => {
  const { isViewingAs, actualUser } = useAuth();
  const { viewAsDisplayName, stopViewAs } = useViewAs();
  const qc = useQueryClient();
  const nav = useNavigate();

  if (!isViewingAs || !actualUser) return null;

  const label = viewAsDisplayName?.trim() || "another user";

  const exit = () => {
    stopViewAs();
    // Blow away every cached query so the admin's next screen doesn't flash
    // the previously-viewed user's data before refetching.
    qc.clear();
    nav("/admin/view-as", { replace: true });
  };

  return (
    <div
      role="status"
      className="w-full bg-foreground text-primary px-3 py-1.5 flex items-center gap-2 shadow-[0_1px_0_rgba(0,0,0,0.12)]"
    >
      <Eye className="size-3.5 shrink-0" />
      <p className="text-[11px] font-body font-semibold leading-tight truncate flex-1">
        Viewing as <span className="text-primary">{label}</span> · read-only
      </p>
      <button
        type="button"
        onClick={exit}
        className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
      >
        <X className="size-3" />
        Exit
      </button>
    </div>
  );
};

export default ViewAsBanner;
