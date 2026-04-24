import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Moodboard {
  id: string;
  name: string;
  emoji: string;
  gradient: string;
  is_favourites: boolean;
  imageCount?: number;
  coverPath?: string | null;
  coverUrl?: string | null;
}

export interface MoodboardImage {
  id: string;
  board_id: string;
  storage_path: string;
  caption: string | null;
  is_favourite: boolean;
  created_at: string;
  signedUrl?: string;
}

const BUCKET = "moodboard-images";

const signUrl = async (path: string): Promise<string | null> => {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
};

export const useMoodboards = () => {
  const { user } = useAuth();
  const [boards, setBoards] = useState<Moodboard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setBoards([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: rows, error } = await supabase
      .from("moodboards")
      .select("id, name, emoji, gradient, is_favourites")
      .eq("user_id", user.id)
      .order("is_favourites", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Load boards failed:", error);
      setLoading(false);
      return;
    }

    // Image counts + cover (most recent image).
    // The Favourites board is special: it does NOT own its own images. Instead it shows
    // every image the user has favourited from any of their other boards. So for the
    // Favourites tile we count and pick a cover from `is_favourite = true` rows scoped
    // to the user, not by board_id.
    const enriched: Moodboard[] = await Promise.all(
      (rows ?? []).map(async (b) => {
        if (b.is_favourites) {
          const { data: favs } = await supabase
            .from("moodboard_images")
            .select("storage_path, created_at")
            .eq("user_id", user.id)
            .eq("is_favourite", true)
            .order("created_at", { ascending: false });
          const cover = favs?.[0]?.storage_path ?? null;
          const coverUrl = cover ? await signUrl(cover) : null;
          return { ...b, imageCount: favs?.length ?? 0, coverPath: cover, coverUrl };
        }
        const { data: imgs } = await supabase
          .from("moodboard_images")
          .select("storage_path, created_at")
          .eq("board_id", b.id)
          .order("created_at", { ascending: false });
        const cover = imgs?.[0]?.storage_path ?? null;
        const coverUrl = cover ? await signUrl(cover) : null;
        return { ...b, imageCount: imgs?.length ?? 0, coverPath: cover, coverUrl };
      }),
    );
    setBoards(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const createBoard = useCallback(
    async (input: { name: string; emoji?: string; gradient?: string }) => {
      if (!user) throw new Error("Sign in required");
      const { data, error } = await supabase
        .from("moodboards")
        .insert({
          user_id: user.id,
          name: input.name,
          emoji: input.emoji ?? "🌸",
          gradient: input.gradient ?? "from-[#C8B89A] to-[#D4B96A]",
        })
        .select("id, name, emoji, gradient, is_favourites")
        .single();
      if (error) throw error;
      await load();
      return data;
    },
    [user, load],
  );

  const deleteBoard = useCallback(
    async (board: Moodboard) => {
      if (!user) return;
      // Remove storage files for this board first
      const { data: imgs } = await supabase
        .from("moodboard_images")
        .select("storage_path")
        .eq("board_id", board.id);
      const paths = (imgs ?? []).map((i) => i.storage_path);
      if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
      const { error } = await supabase.from("moodboards").delete().eq("id", board.id);
      if (error) throw error;
      await load();
    },
    [user, load],
  );

  return { boards, loading, reload: load, createBoard, deleteBoard };
};

export const useMoodboardImages = (boardId: string | undefined) => {
  const { user } = useAuth();
  const [images, setImages] = useState<MoodboardImage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !boardId) {
      setImages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("moodboard_images")
      .select("id, board_id, storage_path, caption, is_favourite, created_at")
      .eq("board_id", boardId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Load images failed:", error);
      setLoading(false);
      return;
    }
    const withUrls: MoodboardImage[] = await Promise.all(
      (data ?? []).map(async (i) => ({ ...i, signedUrl: (await signUrl(i.storage_path)) ?? undefined })),
    );
    setImages(withUrls);
    setLoading(false);
  }, [user, boardId]);

  useEffect(() => {
    load();
  }, [load]);

  const uploadImage = useCallback(
    async (file: File, caption?: string) => {
      if (!user || !boardId) throw new Error("Sign in required");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${boardId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("moodboard_images").insert({
        user_id: user.id,
        board_id: boardId,
        storage_path: path,
        caption: caption ?? null,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insErr;
      }
      await load();
    },
    [user, boardId, load],
  );

  const toggleFavourite = useCallback(
    async (img: MoodboardImage) => {
      const next = !img.is_favourite;
      // optimistic
      setImages((prev) => prev.map((i) => (i.id === img.id ? { ...i, is_favourite: next } : i)));
      const { error } = await supabase
        .from("moodboard_images")
        .update({ is_favourite: next })
        .eq("id", img.id);
      if (error) {
        setImages((prev) => prev.map((i) => (i.id === img.id ? { ...i, is_favourite: !next } : i)));
        throw error;
      }
    },
    [],
  );

  const deleteImage = useCallback(
    async (img: MoodboardImage) => {
      const prev = images;
      setImages((p) => p.filter((i) => i.id !== img.id));
      const { error } = await supabase.from("moodboard_images").delete().eq("id", img.id);
      if (error) {
        setImages(prev);
        throw error;
      }
      await supabase.storage.from(BUCKET).remove([img.storage_path]);
    },
    [images],
  );

  return { images, loading, reload: load, uploadImage, toggleFavourite, deleteImage };
};
