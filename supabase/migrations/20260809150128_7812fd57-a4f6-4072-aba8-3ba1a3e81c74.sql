-- Point the style-record step at the enriched PowerPik row and drop the empty duplicate.
UPDATE public.journal_step_tools st
SET user_tool_id = '91929ee0-b0a8-4c82-a0b5-04f620e1a703'
WHERE st.user_tool_id = '46d6bb6a-e8cd-4362-9f4b-413d84297e25';

DELETE FROM public.user_tools WHERE id = '46d6bb6a-e8cd-4362-9f4b-413d84297e25';