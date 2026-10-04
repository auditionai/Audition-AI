drop function if exists public.get_daily_platform_usage_snapshot(date);

notify pgrst, 'reload schema';
