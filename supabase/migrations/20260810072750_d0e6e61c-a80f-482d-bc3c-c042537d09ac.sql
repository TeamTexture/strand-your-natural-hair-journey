ALTER TABLE public.treatment_plan_media DROP CONSTRAINT IF EXISTS treatment_plan_media_type_rules;
ALTER TABLE public.treatment_plan_media ADD CONSTRAINT treatment_plan_media_type_rules CHECK (
  (media_type = 'photo' AND mime_type IN ('image/jpeg','image/png','image/webp') AND file_size_bytes <= 10485760)
  OR (media_type = 'audio' AND mime_type IN ('audio/webm','audio/mp4','audio/mpeg') AND file_size_bytes <= 15728640)
  OR (media_type = 'video' AND mime_type IN ('video/mp4','video/quicktime','video/webm') AND file_size_bytes <= 52428800)
);