-- The web app uses the cached lightweight gallery polling path. Full-row
-- Realtime events include queue_payload on every progress/lease update.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'generated_images'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.generated_images;
  END IF;
END;
$$;
