// Non-blocking prompt shown on the brand dashboard when the public brand
// profile is missing key content (category, about, or logo). Deep-links to
// the brand profile editor where every field can be updated.
import { useNavigate } from "react-router-dom";
import { Sparkles, CheckCircle2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type BrandProfile = Database["public"]["Tables"]["brand_profiles"]["Row"];

const BrandProfilePrompt = ({ profile }: { profile: BrandProfile | null | undefined }) => {
  const nav = useNavigate();

  const missing: string[] = [];
  if (!profile?.category) missing.push("category");
  if (!profile?.about || profile.about.trim().length < 30) missing.push("description");
  if (!profile?.logo_path) missing.push("logo");

  if (missing.length === 0) {
    return (
      <button
        type="button"
        onClick={() => nav("/brand/profile")}
        className="w-full text-left rounded-[12px] border border-border bg-card p-3 flex items-center gap-3"
      >
        <div className="size-8 rounded-full bg-good/10 text-good flex items-center justify-center shrink-0">
          <CheckCircle2 className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body text-[13px] font-semibold leading-tight truncate">
            Brand page complete
          </p>
          <p className="text-[11px] text-foreground/60 font-body">
            Tap to edit logo, about, socials or contact
          </p>
        </div>
        <span className="text-[11px] text-primary font-body">Edit →</span>
      </button>
    );
  }

  const label =
    missing.length === 3
      ? "Complete your brand page"
      : `Add your ${missing.slice(0, 2).join(" & ")}${missing.length > 2 ? " + more" : ""}`;

  return (
    <button
      type="button"
      onClick={() => nav("/brand/profile")}
      className="w-full text-left rounded-[14px] border border-primary/40 bg-primary/5 p-4 flex items-start gap-3"
    >
      <div className="size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
        <Sparkles className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display text-[14px] font-semibold leading-tight">{label}</p>
        <p className="text-[11.5px] text-foreground/70 font-body leading-snug mt-0.5">
          A polished brand page — logo, description, category — helps members trust and remember you in the STRAND Brands directory.
        </p>
      </div>
      <span className="text-[11px] text-primary font-body shrink-0 self-center">Edit →</span>
    </button>
  );
};

export default BrandProfilePrompt;
