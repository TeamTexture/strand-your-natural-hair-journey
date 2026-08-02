import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookCheck, RefreshCw, Check, Undo2, ChevronDown } from "lucide-react";

import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { smartBack } from "@/lib/smartBack";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** The keys the consumer app reads. Kept in step with useCuratedContent. */
const KEY_LABELS: Record<string, string> = {
  "wash-day-steps": "Wash day, step by step",
  "trim-length-retention": "Trims and length retention",
  "wash-day-guidance": "Wash day guidance tips",
  "wash-log-scalp-and-breakage": "Wash log — scalp and breakage",
  "wash-log-hair-feel": "Wash log — hair feel",
  "wash-log-styling": "Wash log — styling",
};

interface Row {
  id: string;
  content_key: string;
  payload: Record<string, unknown> | null;
  source_passages: unknown;
  status: string;
  manuscript_grounded: boolean | null;
  model_version: string | null;
  generated_at: string | null;
  published_at: string | null;
}

const niceDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

const ItemList = ({ items }: { items: unknown }) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ol className="space-y-2.5">
      {items.map((raw, i) => {
        const o = (raw ?? {}) as Record<string, unknown>;
        return (
          <li key={i} className="text-[12px] leading-relaxed">
            <p className="font-semibold text-foreground">
              {i + 1}. {String(o.headline ?? "")}
            </p>
            {o.body ? <p className="text-foreground/85">{String(o.body)}</p> : null}
            {o.why ? (
              <p className="text-foreground/75 italic">Why: {String(o.why)}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
};

const AdminCuratedContent = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [showPassages, setShowPassages] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-curated-content"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("curated_content")
        .select("*")
        .order("content_key", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-curated-content"] });
    qc.invalidateQueries({ queryKey: ["curated-content"] });
  };

  const regenerate = useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase.functions.invoke("regenerate-curated-content", {
        body: { content_key: key },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("New draft generated from the manuscript");
      invalidate();
    },
    onError: () => toast.error("Could not generate a draft. Please try again."),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "draft" | "published" }) => {
      const { error } = await supabase
        .from("curated_content")
        .update({
          status,
          published_at: status === "published" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "published" ? "Published to members" : "Unpublished");
      invalidate();
    },
    onError: () => toast.error("Could not update this content."),
  });

  const byKey = new Map((rows ?? []).map((r) => [r.content_key, r]));

  return (
    <ScreenLayout>
      <TitleBar title="Curated Content" onBack={smartBack(navigate, "/admin")} />
      <div className="px-5 pb-10">
        <p className="text-[12px] leading-relaxed text-muted-foreground mb-4">
          Every piece of teaching copy in the app is generated from your book and waits here
          until you publish it. Members only ever see published rows — nothing appears in the
          app until you approve it.
        </p>

        {isLoading ? (
          <LoadingDot />
        ) : (
          Object.entries(KEY_LABELS).map(([key, label]) => {
            const row = byKey.get(key);
            const isOpen = open === key;
            return (
              <div key={key} className="mb-4">
                <SectionLabel>{label}</SectionLabel>
                <SurfaceCard>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-pill px-2.5 py-0.5 text-[10.5px] font-semibold ${
                        row?.status === "published"
                          ? "bg-good/15 text-good"
                          : row
                            ? "bg-warn/15 text-warn"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {row?.status === "published"
                        ? "Published"
                        : row
                          ? "Draft — awaiting your review"
                          : "Not generated yet"}
                    </span>
                    {row && (
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : key)}
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary"
                      >
                        {isOpen ? "Hide" : "Review"}
                        <ChevronDown
                          className={`size-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    )}
                  </div>

                  {row && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Generated {niceDate(row.generated_at)}
                      {row.status === "published" ? ` · published ${niceDate(row.published_at)}` : ""}
                    </p>
                  )}

                  {isOpen && row && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      <ItemList items={row.payload?.steps ?? row.payload?.items} />
                      {Array.isArray(row.payload?.dos) && (row.payload?.dos as string[]).length > 0 && (
                        <p className="text-[12px] text-foreground/85">
                          Do: {(row.payload?.dos as string[]).join(" · ")}
                        </p>
                      )}
                      {Array.isArray(row.payload?.donts) &&
                        (row.payload?.donts as string[]).length > 0 && (
                          <p className="text-[12px] text-foreground/85">
                            Don't: {(row.payload?.donts as string[]).join(" · ")}
                          </p>
                        )}

                      <button
                        type="button"
                        onClick={() => setShowPassages(showPassages === key ? null : key)}
                        className="text-[11.5px] font-semibold text-primary"
                      >
                        {showPassages === key ? "Hide book passages" : "Show the book passages used"}
                      </button>
                      {showPassages === key && (
                        <div className="space-y-2 rounded-xl bg-muted/50 p-3">
                          {(Array.isArray(row.source_passages) ? row.source_passages : []).map(
                            (p, i) => {
                              const o = (p ?? {}) as Record<string, unknown>;
                              return (
                                <p key={i} className="text-[11.5px] leading-relaxed text-foreground/80">
                                  {String(o.body ?? o.text ?? "")}
                                </p>
                              );
                            },
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={regenerate.isPending}
                      onClick={() => regenerate.mutate(key)}
                    >
                      <RefreshCw className="size-3.5 mr-1.5" />
                      {row ? "Regenerate draft" : "Generate draft"}
                    </Button>
                    {row && row.status !== "published" && (
                      <Button
                        variant="gold"
                        size="sm"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: row.id, status: "published" })}
                      >
                        <Check className="size-3.5 mr-1.5" />
                        Publish
                      </Button>
                    )}
                    {row && row.status === "published" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={setStatus.isPending}
                        onClick={() => setStatus.mutate({ id: row.id, status: "draft" })}
                      >
                        <Undo2 className="size-3.5 mr-1.5" />
                        Unpublish
                      </Button>
                    )}
                  </div>
                </SurfaceCard>
              </div>
            );
          })
        )}

        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
          <BookCheck className="size-3.5 text-primary shrink-0 mt-[1px]" />
          <span>
            If a draft says anything that is not in your book, regenerate it rather than
            publishing — nothing here is written by hand.
          </span>
        </p>
      </div>
    </ScreenLayout>
  );
};

export default AdminCuratedContent;
