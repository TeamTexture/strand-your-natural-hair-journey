import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import MainPhotoPicker from "@/components/style/MainPhotoPicker";
import { styleCardPhotoKey } from "@/hooks/useStyleCardPhoto";

const TempPhotoSheetHarness = () => {
  const qc = useQueryClient();
  const withPhotos = new URLSearchParams(window.location.search).get("photos") === "1";
  useEffect(() => {
    qc.setQueryData(styleCardPhotoKey(undefined), {
      mainPhotoId: null,
      photos: withPhotos
        ? [
            { id: "a", storage_path: "a", caption: null, taken_on: "2026-08-01", created_at: "2026-08-01", url: "https://placehold.co/300", source: "before" },
            { id: "b", storage_path: "b", caption: null, taken_on: "2026-07-01", created_at: "2026-07-01", url: "https://placehold.co/300", source: "before" },
          ]
        : [],
    });
  }, [qc, withPhotos]);
  return <MainPhotoPicker open onOpenChange={() => {}} />;
};

export default TempPhotoSheetHarness;
