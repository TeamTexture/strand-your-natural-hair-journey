// Admin broadcast — one message to an entire audience.
//
// Each recipient receives it inside their own private STRAND Team thread, so
// replies come back one-to-one exactly like a normal admin message. The
// existing chat_messages insert trigger sends each recipient the
// "strand-message-received" email, so no separate email path is needed.

import { useRef, useState } from "react";
import { prepareImageForAi } from "@/lib/imagePrep";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, ImagePlus, Mic, Send, Square, Trash2, Users, X } from "lucide-react";
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
import { formatVoiceDuration, useVoiceRecorder, type VoiceRecording } from "@/hooks/useVoiceRecorder";
import { transcribeChatVoice, uploadChatVoice } from "@/lib/chatVoice";

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
  // Optional photo. The message text becomes its caption, so one broadcast is
  // still one message per recipient — never a photo plus a separate text.
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sent, setSent] = useState<{ recipients: number; audience: Audience; body: string } | null>(
    null,
  );

  const pickImage = (file: File | null) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("That photo is over 20MB — please choose a smaller one.");
      return;
    }
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImage(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

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
      // The photo is uploaded ONCE and every recipient's message row points at
      // the same object — copying it per recipient would be thousands of files.
      let imagePath: string | null = null;
      if (image) {
        const prepared = await prepareImageForAi(image);
        const path = `${crypto.randomUUID()}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("chat-images")
          .upload(path, prepared.uploadFile, {
            contentType: prepared.uploadFile.type || "image/jpeg",
            upsert: false,
          });
        if (upErr) throw upErr;
        imagePath = path;
      }
      const { data, error } = await supabase.rpc("admin_broadcast_message", {
        _audience: audience,
        _body: body.trim(),
        _image_path: imagePath,
      });
      if (error) throw error;
      return data as { recipients?: number } | null;
    },
    onSuccess: (res) => {
      const n = res?.recipients ?? 0;
      setSent({ recipients: n, audience, body: body.trim() });
      setBody("");
      clearImage();
      void qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
      void qc.invalidateQueries({ queryKey: ["chat-threads"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send"),
  });

  // A photo on its own is a valid broadcast; text alone still is too.
  const canSend = (body.trim().length > 1 || !!image) && !send.isPending;


  if (sent) {
    return (
      <ScreenLayout>
        <TitleBar title="Message sent" onBack={() => setSent(null)} />
        <div className="px-5 pt-4 pb-8 space-y-5">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="size-14 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="size-7 text-primary" />
            </div>
            <h2 className="font-display text-xl leading-tight">
              {sent.recipients === 0
                ? "No accounts in that audience yet"
                : `Delivered to ${sent.recipients} ${
                    sent.recipients === 1 ? "account" : "accounts"
                  }`}
            </h2>
            <p className="text-xs text-muted-foreground font-body leading-snug max-w-[280px]">
              {sent.recipients === 0
                ? "Nothing was sent — there are no accounts in this audience right now."
                : `Everyone in ${AUDIENCE_LABEL[sent.audience]} now has this message in their private STRAND Team conversation, and an email notification is on its way.`}
            </p>
          </div>

          {sent.recipients > 0 && (
            <SurfaceCard>
              <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-medium">
                {AUDIENCE_LABEL[sent.audience]} · {sent.recipients}{" "}
                {sent.recipients === 1 ? "recipient" : "recipients"}
              </p>
              <p className="text-[12.5px] font-body mt-1.5 leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                {sent.body}
              </p>
            </SurfaceCard>
          )}

          <div className="space-y-2.5 pt-1">
            <Button variant="gold" size="pill" className="w-full" onClick={() => setSent(null)}>
              Send another message
            </Button>
            <Button
              variant="outline"
              size="pill"
              className="w-full"
              onClick={() => nav("/admin/messages")}
            >
              Back to messages
            </Button>
          </div>
        </div>
      </ScreenLayout>
    );
  }

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
          placeholder={
            image
              ? "Add a caption for the photo (optional)…"
              : "Write the message everyone in this audience will receive…"
          }
          className="text-[13px]"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-muted-foreground">
            {body.length}/{MAX_BODY}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-primary px-3 py-1.5 rounded-full border border-primary/30 hover:bg-primary/5"
          >
            <ImagePlus className="size-3.5" />
            {image ? "Change photo" : "Attach photo"}
          </button>
        </div>

        {imagePreview && (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5">
            <img
              src={imagePreview}
              alt="Attached photo preview"
              className="size-16 rounded-xl object-cover border border-border"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-body leading-snug">
                Photo attached — everyone in this audience receives it, with your text as the
                caption.
              </p>
            </div>
            <button
              type="button"
              onClick={clearImage}
              aria-label="Remove photo"
              className="shrink-0 size-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
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
