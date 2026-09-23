CREATE TABLE IF NOT EXISTS public.generation_terminal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('completed', 'failed', 'cancelled')),
  asset_type text,
  image_url text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_terminal_events_user_created
  ON public.generation_terminal_events (user_id, created_at DESC);

ALTER TABLE public.generation_terminal_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.generation_terminal_events TO authenticated, service_role;
DROP POLICY IF EXISTS "Users read own terminal generation events" ON public.generation_terminal_events;
CREATE POLICY "Users read own terminal generation events"
  ON public.generation_terminal_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.emit_generation_terminal_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed', 'failed', 'cancelled')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.generation_terminal_events
      (generation_id, user_id, status, asset_type, image_url, error_message)
    VALUES
      (NEW.id, NEW.user_id, NEW.status, NEW.asset_type, NEW.image_url, left(coalesce(NEW.error_message, ''), 2000));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generation_terminal_event ON public.generated_images;
CREATE TRIGGER trg_generation_terminal_event
  AFTER INSERT OR UPDATE OF status, image_url, error_message ON public.generated_images
  FOR EACH ROW EXECUTE FUNCTION public.emit_generation_terminal_event();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'generation_terminal_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_terminal_events;
  END IF;
END;
$$;
