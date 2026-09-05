import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Play, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ProductThumb from "@/components/ProductThumb";
import VoiceNotePlayerRow from "@/components/voice/VoiceNotePlayerRow";

import MatchStars from "@/components/MatchStars";
import { useUserProducts } from "@/hooks/useUserProducts";
import { useUserTools } from "@/hooks/useUserTools";
import TranscriptView from "@/components/voice/TranscriptView";
import type { JournalStep } from "@/hooks/useJournalSteps";

const PHOTO_BUCKET = "journal-photos";
const VIDEO_BUCKET = "journal-videos";

/** Transcript rendered as readable paragraphs, collapsed to a short preview. */
const Transcript = ({ text }: { text: string }) => {
  if (!text.trim()) return null;
  return (
    <div className="rounded-[12px] bg-secondary/50 p-3 space-y-2">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
        <Mic className="size-3 text-primary" /> Voice note
      </p>
      <TranscriptView text={text} />
    </div>
  );
};

/**
 * A logged step, read only. Everything the member recorded, laid out to be
 * reviewed — nothing editable. Editing happens on the step editor screen.
 */
const StepReviewCard = ({ step, index }: { step: JournalStep; index: number }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { allProducts: catalogue } = useUserProducts("all");
  const { tools: toolCatalogue } = useUserTools();

  const [urls, setUrls] = useState<Record<string, string>>({});
  const [posters, setPosters] = useState<Record<string, string>>({});
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const next: Record<string, string> = {};
      const nextPosters: Record<string, string> = {};
      for (const m of step.media) {
        const bucket = m.kind === "photo" ? PHOTO_BUCKET : VIDEO_BUCKET;
        const { data } = await supabase.storage.from(bucket).createSignedUrl(m.storage_path, 3600);
        if (data?.signedUrl) next[m.id] = data.signedUrl;
        if (m.kind === "video" && m.poster_path) {
          const { data: pd } = await supabase.storage
            .from(PHOTO_BUCKET)
            .createSignedUrl(m.poster_path, 3600);
          if (pd?.signedUrl) nextPosters[m.id] = pd.signedUrl;
        }
      }
      if (!alive) return;
      setUrls(next);
      setPosters(nextPosters);
    })();
    return () => { alive = false; };
  }, [step.media]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!step.voice_path) { setVoiceUrl(null); return; }
      const { data } = await supabase.storage
        .from("voicenotes")
        .createSignedUrl(step.voice_path, 3600);
      if (alive) setVoiceUrl(data?.signedUrl ?? null);
    })();
    return () => { alive = false; };
  }, [step.voice_path]);

  const productIds = step.products
    .map((p) => p.user_product_id)
    .filter((v): v is string => !!v);
  const toolIds = step.tools
    .map((t) => t.user_tool_id)
    .filter((v): v is string => !!v);

  const note = (step.note ?? "").trim();
  const empty =
    !note && !step.voice_transcript?.trim() && !step.voice_path &&
    step.media.length === 0 && productIds.length === 0 && toolIds.length === 0;

  const returnTo = location.pathname + location.search;

  return (
    <div className="relative pl-9">
      {/* Timeline spine */}
      <span
        aria-hidden
        className="absolute left-[13px] top-8 bottom-0 w-px bg-border"
      />
      <span className="absolute left-0 top-0 size-[27px] rounded-full bg-primary/12 border border-primary/25 text-primary text-[11px] font-semibold flex items-center justify-center">
        {index + 1}
      </span>

      <div className="rounded-[14px] border border-border bg-card p-3.5 space-y-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Step {index + 1}
        </p>

        {note ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{note}</p>
        ) : empty ? (
          <p className="text-[13px] text-muted-foreground">Nothing recorded on this step.</p>
        ) : null}

        {(voiceUrl || step.voice_transcript?.trim()) && (
          <div className="space-y-2">
            {voiceUrl && <VoiceNotePlayerRow url={voiceUrl} mediaName="voice note" />}
            {step.voice_transcript?.trim() ? (
              <Transcript text={step.voice_transcript} />
            ) : null}
          </div>
        )}

        {step.media.length > 0 && (
          <div className={step.media.length === 1 ? "" : "grid grid-cols-3 gap-1.5"}>
            {step.media.map((m) => (
              <div
                key={m.id}
                className={`relative overflow-hidden rounded-[12px] bg-secondary ${
                  step.media.length === 1 ? "aspect-[4/5]" : "aspect-square"
                }`}
              >
                {m.kind === "photo" ? (
                  urls[m.id] ? (
                    <img
                      src={urls[m.id]}
                      alt={`Step ${index + 1}`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : null
                ) : playing === m.id && urls[m.id] ? (
                  <video
                    src={urls[m.id]}
                    poster={posters[m.id]}
                    controls
                    autoPlay
                    playsInline
                    className="size-full object-contain bg-black"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPlaying(m.id)}
                    className="size-full relative"
                    aria-label={`Play step ${index + 1} video`}
                  >
                    {posters[m.id] ? (
                      <img src={posters[m.id]} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="absolute inset-0 bg-foreground/10" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="size-9 rounded-full bg-background/85 flex items-center justify-center">
                        <Play className="size-4 text-primary" />
                      </span>
                    </span>
                    {m.duration_seconds ? (
                      <span className="absolute bottom-1 left-1 rounded-pill bg-background/85 px-1.5 text-[10px] tabular-nums">
                        {m.duration_seconds}s
                      </span>
                    ) : null}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {productIds.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Products used
            </p>
            {productIds.map((pid) => {
              const p = catalogue.find((c) => c.id === pid);
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => navigate(`/products/profile/${pid}`, { state: { returnTo } })}
                  className="w-full flex items-center gap-2.5 text-left rounded-[10px] -mx-1 px-1 py-1 hover:bg-secondary/50 transition-colors"
                >
                  <ProductThumb
                    imageUrl={p?.image_url ?? null}
                    storagePath={p?.storage_path ?? null}
                    alt={p?.name ?? "Product"}
                    brand={p?.brand ?? null}
                    name={p?.name ?? null}
                    cover
                    wrapperClassName="size-9 rounded-[8px] overflow-hidden bg-secondary shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium leading-snug break-words">
                      {p?.name ?? "Product"}
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0">
                      {p?.brand && (
                        <span className="text-[11px] text-muted-foreground break-words">{p.brand}</span>
                      )}
                      <MatchStars item={p ?? null} size="sm" showValue={false} />

                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {toolIds.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Tools used
            </p>
            {toolIds.map((tid) => {
              const t = toolCatalogue.find((c) => c.id === tid);
              return (
                <button
                  key={tid}
                  type="button"
                  onClick={() => navigate(`/tools/${tid}`, { state: { from: window.location.pathname } })}
                  className="w-full flex items-center gap-2.5 text-left rounded-[10px] -mx-1 px-1 py-1 hover:bg-secondary/50 transition-colors"
                >
                  <ProductThumb
                    imageUrl={t?.image_url ?? null}
                    storagePath={t?.storage_path ?? null}
                    alt={t?.name ?? "Tool"}
                    brand={t?.brand ?? null}
                    name={t?.name ?? null}
                    cover
                    wrapperClassName="size-9 rounded-[8px] overflow-hidden bg-secondary shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium leading-snug break-words">
                      {t?.name ?? "Tool"}
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0">
                      {t?.brand && (
                        <span className="text-[11px] text-muted-foreground break-words">{t.brand}</span>
                      )}
                      <MatchStars item={t ?? null} size="sm" showValue={false} />
                    </span>

                  </span>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StepReviewCard;
