// CRUD hook for the user's hair-care tools.
// Tools have NO ingredient analysis (combs, brushes, dryers, etc. don't have
// labels to scan), so the shape is intentionally lighter than `useUserProducts`.
import { uuid } from "@/lib/uuid";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { convertHeicToJpeg } from "@/lib/imagePrep";

export const TOOL_PHOTO_BUCKET = "product-photos"; // reuse existing bucket
export const TOOL_CATEGORIES = [
  "Brush",
  "Comb",
  "Clips & sectioning",
  "Hair dryer",
  "Diffuser",
  "Steamer",
  "Deep conditioning cap / heat hat",
  "Hair steamer cap",
  "Hot tools (curler / wand)",
  "Microfibre / T-shirt towel",
  "Bonnet / silk scarf",
  "Satin pillowcase",
  "Heat protectant tool",
  "Other",
] as const;

export interface UserTool {
  id: string;
  tool_key: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  storage_path: string | null;
  rating: number | null;
  notes: string | null;
  on_shelf: boolean;
  on_favourite: boolean;
  added_at: string;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function useUserTools() {
  const { user } = useAuth();
  const [tools, setTools] = useState<UserTool[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setTools([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("user_tools")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("user_tools load failed", error);
      setTools([]);
    } else {
      // Sign storage paths to fresh URLs (image_url cached on the row may expire).
      const rows = (data ?? []) as UserTool[];
      const signed = await Promise.all(
        rows.map(async (t) => {
          if (!t.storage_path) return t;
          const { data: sig } = await supabase.storage
            .from(TOOL_PHOTO_BUCKET)
            .createSignedUrl(t.storage_path, 3600);
          return sig?.signedUrl ? { ...t, image_url: sig.signedUrl } : t;
        }),
      );
      setTools(signed);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  /** Add a new tool. Returns the created row, or null on failure. */
  const addTool = useCallback(
    async (input: {
      name: string;
      brand?: string;
      category?: string;
      rating?: number;
      notes?: string;
      photoFile?: File | null;
      /** Remote image URL (e.g. og:image scraped from a product page) — used
       * when the user adds the tool via "Paste link" instead of uploading
       * their own photo. Stored directly on `image_url`. */
      imageUrl?: string | null;
    }): Promise<UserTool | null> => {
      if (!user) {
        toast.error("Please sign in to add tools");
        return null;
      }
      const trimmedName = input.name.trim();
      if (!trimmedName) {
        toast.error("Give your tool a name");
        return null;
      }

      let storage_path: string | null = null;
      if (input.photoFile) {
        try {
          const file = await convertHeicToJpeg(input.photoFile);
          if (file.size > 8 * 1024 * 1024) {
            toast.error("Photo too large (max 8MB)");
            return null;
          }
          const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
          const path = `${user.id}/tools/${uuid()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from(TOOL_PHOTO_BUCKET)
            .upload(path, file, { contentType: file.type, upsert: false });
          if (upErr) {
            console.error("tool photo upload failed", upErr);
            toast.error("Could not upload photo");
            return null;
          }
          storage_path = path;
        } catch (e) {
          console.error(e);
          toast.error("Could not read photo");
          return null;
        }
      }

      const tool_key = `${slugify(input.brand ?? "")}-${slugify(trimmedName)}-${crypto
        .randomUUID()
        .slice(0, 6)}`;
      const { data, error } = await supabase
        .from("user_tools")
        .insert({
          user_id: user.id,
          tool_key,
          name: trimmedName,
          brand: input.brand?.trim() || null,
          category: input.category || null,
          storage_path,
          // Remote URL only used when no file was uploaded — uploaded photos
          // are signed on load instead.
          image_url: storage_path ? null : (input.imageUrl?.trim() || null),
          rating: input.rating ?? null,
          notes: input.notes?.trim() || null,
        })
        .select("*")
        .single();
      if (error) {
        console.error("user_tools insert failed", error);
        toast.error("Could not add tool");
        return null;
      }
      toast.success("Tool added");
      await load();
      return data as UserTool;
    },
    [user, load],
  );

  const updateTool = useCallback(
    async (
      id: string,
      patch: Partial<Pick<UserTool, "name" | "brand" | "category" | "rating" | "notes" | "on_shelf" | "on_favourite">>,
    ) => {
      if (!user) return false;
      const { error } = await supabase
        .from("user_tools")
        .update(patch)
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) {
        toast.error("Could not update tool");
        return false;
      }
      await load();
      return true;
    },
    [user, load],
  );

  const setFavourite = useCallback(
    async (id: string, on: boolean) => {
      if (!user) return false;
      // Optimistic update so the heart fills instantly.
      setTools((prev) => prev.map((t) => (t.id === id ? { ...t, on_favourite: on } : t)));
      const { error } = await supabase
        .from("user_tools")
        .update({ on_favourite: on })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) {
        toast.error("Could not update favourite");
        await load();
        return false;
      }
      return true;
    },
    [user, load],
  );

  const deleteTool = useCallback(
    async (tool: UserTool) => {
      if (!user) return false;
      // Best-effort photo cleanup
      if (tool.storage_path) {
        await supabase.storage.from(TOOL_PHOTO_BUCKET).remove([tool.storage_path]).catch(() => {});
      }
      const { error } = await supabase
        .from("user_tools")
        .delete()
        .eq("id", tool.id)
        .eq("user_id", user.id);
      if (error) {
        toast.error("Could not delete tool");
        return false;
      }
      toast.success("Tool removed");
      await load();
      return true;
    },
    [user, load],
  );

  return { tools, loading, addTool, updateTool, setFavourite, deleteTool, reload: load };
}
