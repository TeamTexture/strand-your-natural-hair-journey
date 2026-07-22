import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import PlusGate from "@/components/PlusGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import MentionTextarea from "@/components/MentionTextarea";

const ForumNewThread = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const catsQ = useQuery({
    queryKey: ["forum_categories"],
    queryFn: async () => {
      const { data } = await supabase.from("forum_categories").select("id,name").order("sort_order");
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!title.trim()) { toast.error("Add a title"); return; }
    if (!user) return;
    if (!categoryId && (catsQ.data?.length ?? 0) > 0) {
      toast.error("Choose a category");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("forum_threads")
        .insert({
          title: title.trim(),
          body: body.trim(),
          author_id: user.id,
          category_id: categoryId || (catsQ.data?.[0]?.id ?? ""),
        })
        .select("id")
        .single();
      if (error) throw error;
      nav(`/forum/${data.id}`);
    } catch (e) {
      toast.error((e as Error).message ?? "Could not post");
      setBusy(false);
    }
  };

  return (
    <PlusGate title="New thread">
      <ScreenLayout>
        <TitleBar title="New thread" onBack={() => nav(-1)} />
        <div className="px-5 pb-10 space-y-4">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <select
              className="w-full h-10 rounded-md border border-border bg-card px-3 text-sm font-body"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Choose…</option>
              {catsQ.data?.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ask a question or share something…" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Body <span className="text-foreground/50 text-[11px]">(optional · type @ to tag a member)</span></Label>
            <MentionTextarea value={body} onChange={setBody} rows={7} maxLength={4000} placeholder="Share your thoughts… tag people with @" />
          </div>
          <Button variant="gold" size="pill" className="w-full" onClick={submit} disabled={busy || !title.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Post to community"}
          </Button>
        </div>
      </ScreenLayout>
    </PlusGate>
  );
};

export default ForumNewThread;
