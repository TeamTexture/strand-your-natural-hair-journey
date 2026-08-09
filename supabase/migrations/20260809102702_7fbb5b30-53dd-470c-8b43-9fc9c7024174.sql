CREATE TABLE IF NOT EXISTS public.journal_step_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.journal_steps(id) ON DELETE CASCADE,
  user_tool_id uuid REFERENCES public.user_tools(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_step_tools_step_idx ON public.journal_step_tools(step_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_step_tools TO authenticated;
GRANT ALL ON public.journal_step_tools TO service_role;
ALTER TABLE public.journal_step_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own journal step tools"
ON public.journal_step_tools FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.journal_steps s
  JOIN public.journal_entries e ON e.id = s.entry_id
  WHERE s.id = journal_step_tools.step_id AND e.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.journal_steps s
  JOIN public.journal_entries e ON e.id = s.entry_id
  WHERE s.id = journal_step_tools.step_id AND e.user_id = auth.uid()
));