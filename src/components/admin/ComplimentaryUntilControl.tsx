import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Gift, History, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  userId: string;
  name: string | null;
  /** Persisted end of the current gifted period, if any. */
  complimentaryUntil: string | null;
}

interface GrantRow {
  id: string;
  action: string;
  end_date: string | null;
  reason: string | null;
  note: string | null;
  created_at: string;
}

function longDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Today + 1 day, as YYYY-MM-DD, for the date input minimum. */
function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Gift a member free access until a chosen date, or end that gift early.
 *
 * The gift is a real Stripe trial on her real subscription, so billing stays
 * with Stripe: when the date passes she is charged if a card is on file, and
 * the subscription simply ends if not. Separate from the permanent
 * complimentary switch above, which is untouched by this control.
 */
const ComplimentaryUntilControl = ({ userId, name, complimentaryUntil }: Props) => {
  const qc = useQueryClient();
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const live = !!complimentaryUntil && new Date(complimentaryUntil).getTime() > Date.now();

  const history = useQuery({
    queryKey: ["complimentary_grants", userId],
    enabled: showHistory,
    queryFn: async (): Promise<GrantRow[]> => {
      const { data, error } = await supabase
        .from("complimentary_grants")
        .select("id, action, end_date, reason, note, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as GrantRow[];
    },
  });

  const run = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("admin-complimentary-access", {
        body: payload,
      });
      if (error) throw error;
      const err = (data as { error?: string } | null)?.error;
      if (err) throw new Error(err);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-members"] });
      qc.invalidateQueries({ queryKey: ["complimentary_grants", userId] });
    },
  });

  const grant = () => {
    if (!endDate) {
      toast.error("Choose the date the free access should end.");
      return;
    }
    run.mutate(
      { action: "grant", user_id: userId, end_date: endDate, reason: reason || null, note: note || null },
      {
        onSuccess: () => {
          toast.success(`Free access set until ${longDate(`${endDate}T12:00:00Z`)}.`);
          setEndDate("");
          setReason("");
          setNote("");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "That did not save."),
      },
    );
  };

  const endNow = () => {
    run.mutate(
      { action: "end", user_id: userId, reason: reason || null, note: note || null },
      {
        onSuccess: () => {
          toast.success("Free access ended.");
          setConfirmEnd(false);
          setReason("");
          setNote("");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "That did not save."),
      },
    );
  };

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-[12px] font-body font-medium">Free access until a date</p>
      <p className="text-[11px] text-muted-foreground leading-snug">
        Gives {name ?? "this member"} the full app free until the date you choose. Billing
        then starts automatically if she has a card saved, or the membership simply ends.
      </p>

      {live ? (
        <p className="mt-2 text-[11px] font-body text-primary leading-snug flex items-start gap-1.5">
          <CalendarClock className="size-3.5 mt-[1px] shrink-0" />
          <span>
            Free until {longDate(complimentaryUntil)} (
            {formatDistanceToNow(new Date(complimentaryUntil!), { addSuffix: true })}).
          </span>
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground italic leading-snug">
          No free period running.
        </p>
      )}

      <div className="mt-2.5 space-y-2">
        <Input
          type="date"
          min={tomorrow()}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-9 text-[12px] font-body"
          aria-label="Free access end date"
        />
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (for your records)"
          className="h-9 text-[12px] font-body"
        />
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          rows={2}
          className="text-[12px] font-body"
        />
        <Button
          size="sm"
          className="w-full h-9 rounded-pill text-[12px] font-body"
          disabled={run.isPending || !endDate}
          onClick={grant}
        >
          {run.isPending ? (
            <Loader2 className="size-3.5 mr-1.5 animate-spin" />
          ) : (
            <Gift className="size-3.5 mr-1.5" />
          )}
          {live ? "Change the end date" : "Give free access"}
        </Button>

        {live && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-9 rounded-pill text-[12px] font-body text-destructive hover:text-destructive hover:bg-destructive/10"
            disabled={run.isPending}
            onClick={() => setConfirmEnd(true)}
          >
            End free access now
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full h-8 rounded-pill text-[11px] font-body text-muted-foreground"
          onClick={() => setShowHistory((v) => !v)}
        >
          <History className="size-3.5 mr-1.5" />
          {showHistory ? "Hide history" : "History"}
        </Button>
      </div>

      {showHistory && (
        <div className="mt-2 space-y-1.5">
          {history.isLoading ? (
            <p className="text-[11px] text-muted-foreground">Loading…</p>
          ) : (history.data ?? []).length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">Nothing recorded yet.</p>
          ) : (
            (history.data ?? []).map((h) => (
              <div key={h.id} className="rounded-lg bg-muted/40 p-2">
                <p className="text-[11px] font-body font-medium">
                  {h.action === "granted"
                    ? `Free access until ${longDate(h.end_date ? `${h.end_date}T12:00:00Z` : null)}`
                    : "Free access ended early"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(h.created_at).toLocaleDateString("en-GB")}
                  {h.reason ? ` · ${h.reason}` : ""}
                </p>
                {h.note && (
                  <p className="text-[10px] font-body text-muted-foreground leading-snug break-words">
                    {h.note}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End free access now?</AlertDialogTitle>
            <AlertDialogDescription>
              {name ?? "This member"} will start being charged straight away if she has a
              card saved. If she does not, her membership ends and she loses app access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it running</AlertDialogCancel>
            <Button
              variant="destructive"
              className="rounded-pill"
              disabled={run.isPending}
              onClick={endNow}
            >
              {run.isPending && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              End free access
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ComplimentaryUntilControl;
