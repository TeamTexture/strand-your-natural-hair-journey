import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, ArrowLeft, Loader2 } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import PlusGate from "@/components/PlusGate";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const MemberProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const profileQ = useQuery({
    queryKey: ["member_profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id,display_name,avatar_url").eq("user_id", userId!).maybeSingle();
      return data;
    },
  });

  const startDm = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("start_member_dm", { _other_user: userId });
      if (error) throw error;
      nav(`/messages/${data}`);
    } catch (e) {
      toast.error((e as Error).message ?? "Could not open chat");
      setBusy(false);
    }
  };
  const block = async () => {
    if (!userId || !user) return;
    if (!window.confirm("Block this member? They won't be able to message you.")) return;
    const { error } = await supabase.from("forum_blocks").insert({ blocker_id: user.id, blocked_id: userId });
    if (error) toast.error(error.message); else toast.success("Blocked");
  };

  const firstName = (profileQ.data?.display_name ?? "Member").split(" ")[0];

  return (
    <PlusGate title="Member">
      <ScreenLayout>
        <TitleBar title="Member" onBack={() => nav(-1)} />
        {profileQ.isLoading ? <LoadingDot /> : (
          <div className="px-5 pt-4 pb-10 text-center space-y-4">
            {profileQ.data?.avatar_url ? (
              <img src={profileQ.data.avatar_url} alt="" className="mx-auto size-24 rounded-full object-cover" />
            ) : (
              <div className="mx-auto size-24 rounded-full bg-primary/15 text-primary text-3xl flex items-center justify-center font-display font-semibold">
                {firstName[0]}
              </div>
            )}
            <h1 className="font-display text-2xl font-semibold">{firstName}</h1>
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="gold" size="pill" className="w-full" onClick={startDm} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : (<span className="inline-flex items-center gap-2"><MessageCircle className="size-4" /> Message</span>)}
              </Button>
              <Button variant="ghost" size="pill" className="w-full text-alert-dark" onClick={block}>Block</Button>
              <Link to="/forum">
                <Button variant="link" className="text-foreground/60"><ArrowLeft className="size-3 mr-1" /> Back to forum</Button>
              </Link>
            </div>
          </div>
        )}
      </ScreenLayout>
    </PlusGate>
  );
};

export default MemberProfile;
