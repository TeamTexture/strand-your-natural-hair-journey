import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import HairStrandIcon from "@/components/HairStrandIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";
import { toast } from "sonner";
import { BRAND_CATEGORIES, type BrandCategory } from "@/lib/brandCategories";

/**
 * Dedicated brand auth surface. Signup collects brand_name + contact +
 * website up front, creates a brand_profiles row, and grants the 'brand'
 * role via edge function on first sign-in.
 */
const BrandAuth = () => {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialMode = params.get("mode") === "signin" ? "signin" : "signup";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const { user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [brandName, setBrandName] = useState("");
  const [contactName, setContactName] = useState("");
  const [website, setWebsite] = useState("");
  const [about, setAbout] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [category, setCategory] = useState<BrandCategory | "">("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && user) nav("/brand", { replace: true });
  }, [authLoading, user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || password.length < 6) {
      toast.error("Enter a valid email and a 6+ character password.");
      return;
    }
    if (mode === "signup") {
      if (password !== confirm) return toast.error("Passwords don't match.");
      if (!brandName.trim()) return toast.error("Please enter your brand name.");
      if (!category) return toast.error("Please choose a brand category.");
      if (about.trim().length < 30) return toast.error("Please add a short brand description (30+ characters).");
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/brand`,
            data: {
              display_name: contactName || brandName,
              brand_intent: true,
            },
          },
        });
        if (error) throw error;
        // Session may or may not exist depending on email-confirmation
        // settings. If it does, immediately provision the brand role +
        // profile via the edge function (uses service role — bypasses RLS).
        if (data.session) {
          const { error: fnErr } = await supabase.functions.invoke("brand-signup", {
            body: {
              brand_name: brandName.trim(),
              contact_name: contactName.trim() || null,
              website: website.trim() || null,
              category: category || null,
            },
          });
          if (fnErr) throw fnErr;
        }
        toast.success("Brand account created");
        // Brands pay the annual access fee BEFORE landing in the dashboard.
        nav("/brand/subscribe", { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav("/brand", { replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full px-7 pb-8 bg-background overflow-y-auto">
      <div className="flex flex-col items-center text-center pt-6 gap-3">
        <HairStrandIcon className="w-12 h-12 text-primary" />
        <h1 className="font-display text-primary text-4xl font-semibold tracking-strand uppercase">Strand</h1>
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">For Brands</p>
        <p className="max-w-[280px] text-foreground/75 text-sm leading-relaxed">
          Reach thousands of women invested in their natural hair journey. Place your offers directly in-app.
        </p>
      </div>

      <form onSubmit={submit} className="w-full flex flex-col gap-3 mt-6 selectable">
        {mode === "signup" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Brand name *</Label>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Hello Klean" required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Brand category *</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as BrandCategory)}
                required
                className="w-full text-sm p-2.5 rounded-[10px] border border-border bg-card focus:outline-none focus:border-primary/60"
              >
                <option value="">Choose a category…</option>
                {BRAND_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Contact name</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Website</Label>
              <Input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Password</Label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Confirm password</Label>
            <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
          </div>
        )}

        <Button variant="gold" size="pill" type="submit" disabled={busy} className="mt-2">
          {busy ? "Please wait…" : mode === "signup" ? "Create brand account" : "Sign in"}
        </Button>
        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signup" ? "Already have a brand account? Sign in" : "New brand? Create an account"}
        </button>
        <button type="button" onClick={() => nav("/")} className="text-center text-[11px] text-muted-foreground/70 hover:text-foreground">
          ← Back to STRAND
        </button>
      </form>
    </div>
  );
};

export default BrandAuth;
