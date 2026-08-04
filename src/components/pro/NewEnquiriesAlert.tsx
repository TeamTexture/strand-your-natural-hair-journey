// Login popup for professionals: on session start, if enquiries arrived since
// the last time this pro was active, show a centred prompt with the count and
// a direct route into the Enquiries tab.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRoles";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import { allowsProFeatures } from "@/lib/viewFeatures";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SEEN_KEY = (uid: string) => `strand.pro.enquiriesLastSeen.${uid}`;
const SHOWN_KEY = "strand.pro.enquiriesPopupShownThisSession";

const NewEnquiriesAlert = () => {
  const { user } = useAuth();
  const { isProfessional, isAdmin, loading } = useRoles();
  const nav = useNavigate();
  const view = useActiveRoleView();
  const inProView = allowsProFeatures(view);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (loading || !user?.id) return;
    if (!isProfessional && !isAdmin) return;
    // Professional-only popup: never interrupt the member/brand/admin views.
    if (!inProView) return;
    if (sessionStorage.getItem(SHOWN_KEY) === "1") return;

    let cancelled = false;
    (async () => {
      const key = SEEN_KEY(user.id);
      const lastSeen = localStorage.getItem(key);
      const nowIso = new Date().toISOString();

      let query = supabase
        .from("pro_enquiries")
        .select("id", { head: true, count: "exact" })
        .eq("pro_user_id", user.id)
        .eq("status", "pending");
      if (lastSeen) query = query.gt("created_at", lastSeen);

      const { count: pending } = await query;
      if (cancelled) return;

      sessionStorage.setItem(SHOWN_KEY, "1");
      localStorage.setItem(key, nowIso);
      if ((pending ?? 0) > 0) setCount(pending ?? 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, isProfessional, isAdmin, loading, inProView]);

  const dismiss = () => setCount(0);
  const review = () => {
    setCount(0);
    nav("/pro/enquiries");
  };

  return (
    <Dialog open={inProView && count > 0} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-w-[320px] p-5 rounded-[18px]">
        <DialogHeader className="space-y-2">
          <div className="flex justify-center">
            <span className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Inbox className="size-5 text-primary" aria-hidden="true" />
            </span>
          </div>
          <DialogTitle className="font-display text-lg text-center">
            {count === 1 ? "1 new enquiry" : `${count} new enquiries`}
          </DialogTitle>
          <DialogDescription className="text-center text-xs">
            {count === 1
              ? "A member has enquired since you were last here."
              : "Members have enquired since you were last here."}{" "}
            Review and respond to keep your reply time strong.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={review} className="w-full">Review enquiries</Button>
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] text-muted-foreground hover:underline font-body pt-1"
          >
            Later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewEnquiriesAlert;
