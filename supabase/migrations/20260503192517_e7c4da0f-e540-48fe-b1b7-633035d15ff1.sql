DELETE FROM public.ai_summaries
WHERE kind = 'nutrition_plan'
  AND (
    jsonb_array_length(COALESCE(payload->'diet', '[]'::jsonb)) = 0
    OR jsonb_array_length(COALESCE(payload->'avoid', '[]'::jsonb)) = 0
    OR COALESCE(payload->>'summary', '') = ''
  );