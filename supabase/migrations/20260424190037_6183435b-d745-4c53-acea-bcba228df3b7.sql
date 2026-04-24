ALTER TABLE public.wash_days REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wash_days;