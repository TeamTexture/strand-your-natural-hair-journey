import { smartBack } from "@/lib/smartBack";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BadgeCheck, MessageSquarePlus } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChatThreads } from "@/hooks/useChat";
import { useMarkAdminEntityRead } from "@/hooks/useAdminNotifications";
import SectionLabel from "@/components/SectionLabel";

const AdminMessages = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  // Deep link from the admin notification email: ?enquiry=<contact_messages.id>
  const focusEnquiryId = params.get("enquiry");
  const focusRef = useRef<HTMLDivElement | null>(null);
  const { data: threads, isLoading } = useChatThreads();
  const markEntityRead = useMarkAdminEntityRead();


  const { data: enquiries } = useQuery({
    queryKey: ["admin", "contact-messages"],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("id, name, email, subject, message, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  // The list is capped at 50, so fetch the deep-linked enquiry directly to be
  // certain the email link always lands on the message it names.
  const { data: focusEnquiry } = useQuery({
    queryKey: ["admin", "contact-message", focusEnquiryId],
    enabled: !!user?.id && !!focusEnquiryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("id, name, email, subject, message, created_at")
        .eq("id", focusEnquiryId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const enquiryList = useMemo(() => {
    const rows = [...(enquiries ?? [])];
    if (focusEnquiry && !rows.some((r) => r.id === focusEnquiry.id)) rows.unshift(focusEnquiry);
    if (focusEnquiryId) {
      rows.sort((a, b) => Number(b.id === focusEnquiryId) - Number(a.id === focusEnquiryId));
    }
    return rows;
  }, [enquiries, focusEnquiry, focusEnquiryId]);

  useEffect(() => {
    (enquiries ?? []).forEach((e) => {
      void markEntityRead("contact_message", e.id);
    });
    if (focusEnquiryId) void markEntityRead("contact_message", focusEnquiryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiries, focusEnquiryId]);

  // Scroll the named message into view once it has rendered.
  useEffect(() => {
    if (!focusEnquiryId) return;
    const t = window.setTimeout(() => {
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
    return () => window.clearTimeout(t);
  }, [focusEnquiryId, enquiryList.length]);


  const support = useMemo(
    () => (threads ?? []).filter((t) => t.thread_type === "admin_support" && t.admin_user_id === user?.id),
    [threads, user?.id],
  );

  const subjectIds = Array.from(new Set(support.map((t) => t.subject_user_id).filter((v): v is string => !!v)));
  const { data: names } = useQuery({
    queryKey: ["admin-messages-names", subjectIds.sort().join(",")],
    enabled: subjectIds.length > 0,
    queryFn: async () => {
      const map = new Map<string, string>();
      const { data } = await supabase.from("profiles").select("user_id, display_name").in("user_id", subjectIds);
      (data ?? []).forEach((r) => map.set(r.user_id, r.display_name ?? "Member"));
      return map;
    },
  });

  const { data: unreadMap } = useQuery({
    queryKey: ["admin-messages-unread", support.map((t) => t.id)],
    enabled: support.length > 0 && !!user?.id,
    queryFn: async () => {
      const ids = support.map((t) => t.id);
      const { data } = await supabase
        .from("chat_messages")
        .select("thread_id")
        .in("thread_id", ids)
        .neq("sender_id", user!.id)
        .is("read_at", null);
      const m = new Map<string, number>();
      for (const r of data ?? []) m.set(r.thread_id, (m.get(r.thread_id) ?? 0) + 1);
      return m;
    },
  });

  return (
    <ScreenLayout>
      <TitleBar title="STRAND Team messages" onBack={smartBack(nav, "/admin")} />

      <div className="px-5 pb-3">
        <p className="text-xs text-muted-foreground font-body leading-snug">
          Chat directly with any member, professional or brand. They see this as "STRAND Team".
        </p>
      </div>

      <div className="px-5 pb-4">
        <Button variant="gold" size="pill" className="w-full" onClick={() => nav("/admin/broadcast")}>
          <Users className="size-3.5 mr-1.5" /> Send a group message
        </Button>
      </div>

      <div className="px-5 pb-3 grid grid-cols-3 gap-2">
        <Button variant="outline" size="pill" onClick={() => nav("/admin/members")} className="w-full !px-2 !text-[12px]">
          <MessageSquarePlus className="size-3.5 mr-1" /> Members
        </Button>
        <Button variant="outline" size="pill" onClick={() => nav("/admin/professionals")} className="w-full !px-2 !text-[12px]">
          <MessageSquarePlus className="size-3.5 mr-1" /> Pros
        </Button>
        <Button variant="outline" size="pill" onClick={() => nav("/admin/brands")} className="w-full !px-2 !text-[12px]">
          <MessageSquarePlus className="size-3.5 mr-1" /> Brands
        </Button>
      </div>

      <div className="px-5 pb-8 space-y-2.5">
        {isLoading ? (
          <LoadingDot label="Loading…" fullScreen={false} />
        ) : support.length === 0 ? (
          <EmptyState icon="💬" message="No support threads yet" hint="Start one from a member, pro or brand card." />
        ) : (
          support.map((t) => {
            const name = t.subject_user_id ? names?.get(t.subject_user_id) ?? "Member" : "Member";
            const unread = unreadMap?.get(t.id) ?? 0;
            const last = t.last_message_at ?? t.created_at;
            return (
              <SurfaceCard
                key={t.id}
                onClick={() => nav(`/messages/${t.id}`)}
                className="cursor-pointer hover:border-primary/50"
              >
                <div className="flex items-center gap-3">
                  <div className="size-11 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <BadgeCheck className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-display text-sm font-semibold leading-tight truncate flex-1">{name}</p>
                      {unread > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-body font-semibold leading-none">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(last), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </SurfaceCard>
            );
          })
        )}
      </div>

      {enquiryList.length > 0 && (
        <>
          <SectionLabel>Contact enquiries</SectionLabel>
          <div className="px-5 pb-8 space-y-2.5">
            {enquiryList.map((e) => (
              <SurfaceCard
                key={e.id}
                ref={e.id === focusEnquiryId ? focusRef : undefined}
                className={e.id === focusEnquiryId ? "border-primary ring-2 ring-primary/30" : undefined}
              >

                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold leading-tight break-words">
                    {e.subject || "Enquiry"}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-body mt-0.5 break-all">
                    {e.name} · {e.email}
                  </p>
                  <p className="text-[12px] font-body leading-snug mt-1.5 break-words whitespace-pre-line">
                    {e.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </p>
                  <a
                    href={`mailto:${e.email}?subject=${encodeURIComponent(`Re: ${e.subject || "Your enquiry"}`)}`}
                    className="inline-block text-[12px] text-primary underline underline-offset-2 mt-2"
                  >
                    Reply by email
                  </a>
                </div>
              </SurfaceCard>
            ))}
          </div>
        </>
      )}
    </ScreenLayout>
  );
};

export default AdminMessages;
