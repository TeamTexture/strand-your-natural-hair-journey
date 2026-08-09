// Admin broadcast — one message to an entire audience.
//
// Each recipient receives it inside their own private STRAND Team thread, so
// replies come back one-to-one exactly like a normal admin message. The
// existing chat_messages insert trigger sends each recipient the
// "strand-message-received" email, so no separate email path is needed.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Send, Users } from "lucide-react";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { smartBack } from "@/lib/smartBack";

type Audience = "all" | "consumer" | "professional" | "brand";

const AUDIENCES: Array<{ key: Audience; label: string; hint: string }> = [
  { key: "all", label: "Everyone", hint: "Members, professionals and brands" },
  { key: "consumer", label: "Members", hint: "End users only" },
  { key: "professional", label: "Professionals", hint: "Pro accounts only" },
  { key: "brand", label: "Brands", hint: "Brand accounts only" },
];

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "Everyone",
  consumer: "Members",
  professional: "Professionals",
  brand: "Brands",
};

const MAX_BODY = 1200;

const AdminBroadcast = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [audience, setAudience] = useState<Audience>("all");
  const [body, setBody] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: history } = useQuery({
    queryKey: ["admin", "broadcasts"],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_broadcasts")
        .select("id, audience, body, recipient_count, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("admin_broadcast_message", {
        _audience: audience,
        _body: body.trim(),
      });
      if (error) throw error;
      return data as { recipients?: number } | null;
    },
    onSuccess: (res) => {
      const n = res?.recipients ?? 0;
      toast.success(
        n === 0
          ? "No accounts in that audience yet"
          : `Sent to ${n} ${n === 1 ? "account" : "accounts"} — emails on their way`,
      );
      setBody("");
      void qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
      void qc.invalidateQueries({ queryKey: ["chat-threads"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send"),
  });

  const canSend = body.trim().length > 1 && !send.isPending;

  return (
    <ScreenLayout>
      <TitleBar title="Group message" onBack={smartBack(nav, "/admin/messages")} />

      <div className="px-5 pb-3">
        <p className="text-xs text-muted-foreground font-body leading-snug">
          Sends one message to every account in the audience. Each person gets it privately from
          "STRAND Team" and receives an email telling them a message is waiting — replies come back
          to you one-to-one.
        </p>
      </div>

      <SectionLabel>Audience</SectionLabel>
      <div className="px-5 pb-4 grid grid-cols-2 gap-2">
        {AUDIENCES.map((a) => {
          const active = audience === a.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => setAudience(a.key)}
              className={`text-left rounded-2xl border p-3 transition-colors ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <p className="font-display text-[13px] font-semibold leading-tight flex items-center gap-1.5">
                <Users className={`size-3.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                {a.label}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{a.hint}</p>
            </button>
          );
        })}
      </div>

      <SectionLabel>Message</SectionLabel>
      <div className="px-5 pb-2 space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
          rows={6}
          placeholder="Write the message everyone in this audience will receive…"
          className="text-[13px]"
        />
        <span className="block text-[10px] text-muted-foreground">
          {body.length}/{MAX_BODY}
        </span>
      </div>

      <div className="px-5 py-4 flex justify-center">
        <Button
          variant="gold"
          size="pill"
          className="w-full"
          disabled={!canSend}
          onClick={() => setConfirmOpen(true)}
        >
          <Send className="size-3.5 mr-1.5" />
          {send.isPending ? "Sending…" : `Send to ${AUDIENCE_LABEL[audience]}`}
        </Button>
      </div>


      {(history ?? []).length > 0 && (
        <>
          <SectionLabel>Recent broadcasts</SectionLabel>
          <div className="px-5 pb-8 space-y-2.5">
            {(history ?? []).map((h) => (
              <SurfaceCard key={h.id}>
                <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-medium">
                  {AUDIENCE_LABEL[(h.audience as Audience) ?? "all"] ?? h.audience} ·{" "}
                  {h.recipient_count} {h.recipient_count === 1 ? "recipient" : "recipients"}
                </p>
                <p className="text-[12.5px] font-body mt-1.5 leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {h.body}
                </p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                </p>
              </SurfaceCard>
            ))}
          </div>
        </>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {AUDIENCE_LABEL[audience]}?</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone in this audience gets this message and an email notification. This cannot be
              unsent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => send.mutate()}>Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenLayout>
  );
};

export default AdminBroadcast;
