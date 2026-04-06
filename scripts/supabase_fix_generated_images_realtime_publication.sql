/* -- Ensure generated_images is fully published to Supabase Realtime.
-- Run this in Supabase SQL Editor on the current project.
--
-- Why:
-- Some projects end up with a column-limited publication entry, which can
-- prevent queue status/progress fields from reaching Realtime subscribers.

begin;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'generated_images'
  ) then
    alter publication supabase_realtime drop table public.generated_images;
  end if;
end
$$;

alter publication supabase_realtime add table public.generated_images;

commit;

select *
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'generated_images';
 */