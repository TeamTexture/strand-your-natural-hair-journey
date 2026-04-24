import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { WashDay } from "@/hooks/useWashDays";
import { cn } from "@/lib/utils";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">{label}</p>
    <div className="text-sm">{value}</div>
  </div>
);

const WashDayDetail = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [wd, setWd] = useState<WashDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("wash_days")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setWd((data as unknown as WashDay) ?? null);
        if (data?.hair_feel_voice_url) {
          // The voice url is a storage path under voicenotes
          const { data: sig } = await supabase.storage
            .from("voicenotes")
            .createSignedUrl(data.hair_feel_voice_url, 3600);
          setVoiceUrl(sig?.signedUrl ?? null);
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, id]);

  if (loading) {
    return (
      <ScreenLayout>
        <TitleBar title="Wash Day" back />
        <div className="px-5 py-8 text-sm text-muted-foreground">Loading…</div>
      </ScreenLayout>
    );
  }
  if (!wd) {
    return (
      <ScreenLayout>
        <TitleBar title="Wash Day" back />
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">Wash day not found.</p>
          <Button variant="goldOutline" size="pill" onClick={() => navigate("/wash-day")}>
            ← Back to Wash Day
          </Button>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <TitleBar title="Wash Day" back />
      <div className="px-5 pb-8 space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium">Logged</p>
          <h1 className="font-display text-xl font-bold">{fmtDate(wd.wash_date)}</h1>
        </div>

        {wd.steps?.length > 0 && (
          <SurfaceCard padded={false} className="divide-y divide-border/60">
            <div className="p-3.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Steps
            </div>
            {wd.steps.map((s, i) => (
              <div key={i} className="p-3 flex items-start gap-3">
                <span className="size-6 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{s.name}</p>
                  {s.product_name && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Product: {s.product_name}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </SurfaceCard>
        )}

        {wd.heat_treatment && (
          <SurfaceCard>
            <Field
              label="Heat treatment"
              value={
                <span>
                  {wd.heat_treatment.product ?? "—"}
                  {wd.heat_treatment.duration_min != null &&
                    ` · ${wd.heat_treatment.duration_min} min`}
                </span>
              }
            />
          </SurfaceCard>
        )}

        <SurfaceCard className="grid grid-cols-2 gap-4">
          {wd.scalp_feel && <Field label="Scalp feel" value={wd.scalp_feel} />}
          {wd.breakage && <Field label="Breakage" value={wd.breakage} />}
          {wd.style_after && <Field label="Style after" value={wd.style_after} />}
          {wd.duration_min != null && (
            <Field label="Duration" value={`${wd.duration_min} min`} />
          )}
          {wd.stress_level != null && (
            <Field label="Stress level" value={`${wd.stress_level}/5`} />
          )}
        </SurfaceCard>

        {(wd.hair_feel_note || voiceUrl) && (
          <SurfaceCard>
            <Field
              label="Hair feel"
              value={
                <div className="space-y-2">
                  {wd.hair_feel_note && (
                    <p className="text-sm leading-snug">{wd.hair_feel_note}</p>
                  )}
                  {voiceUrl && (
                    <audio controls src={voiceUrl} className="w-full" />
                  )}
                </div>
              }
            />
          </SurfaceCard>
        )}

        {wd.ai_insight && (
          <SurfaceCard tone="gold">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">
              ✨ AI Insight
            </p>
            <p className="text-sm leading-snug">{wd.ai_insight}</p>
          </SurfaceCard>
        )}

        <Button variant="goldOutline" size="pill" onClick={() => navigate("/wash-day")}>
          ← Back to Wash Day
        </Button>
      </div>
    </ScreenLayout>
  );
};

export default WashDayDetail;
