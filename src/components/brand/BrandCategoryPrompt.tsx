// Non-blocking prompt shown on the brand dashboard when a brand hasn't set
// their category yet. Category is brand-owned — admins can't edit it.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BRAND_CATEGORIES } from "@/lib/brandCategories";
import { toast } from "sonner";

const BrandCategoryPrompt = ({ current }: { current?: string | null }) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>(current ?? "");

  const save = useMutation({
    mutationFn: async (category: string) => {
      if (!user) throw new Error("Sign in required");
      const { error } = await supabase
        .from("brand_profiles")
        .update({ category })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-profile"] });
      toast.success("Category saved");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-[14px] border border-primary/40 bg-primary/5 p-4 flex items-start gap-3"
      >
        <div className="size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Tag className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[14px] font-semibold leading-tight">
            Add your brand category
          </p>
          <p className="text-[11.5px] text-foreground/70 font-body leading-snug mt-0.5">
            Choose a category so members can find you in the STRAND Brands directory.
          </p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[340px]">
          <DialogHeader>
            <DialogTitle className="font-display">Brand category</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2">
            {BRAND_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChoice(c)}
                className={`text-left text-sm rounded-[10px] border px-3 py-2 font-body transition-colors ${
                  choice === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => save.mutate(choice)}
              disabled={!choice || save.isPending}
              className="rounded-pill"
            >
              {save.isPending ? "Saving…" : "Save category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BrandCategoryPrompt;
