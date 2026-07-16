begin;

-- Queue retries predate the generated_images.image_url NOT NULL constraint and
-- may still try to clear the placeholder with NULL. Preserve the existing URL
-- (normally an empty string before completion) so watchdog recovery remains
-- atomic instead of aborting the whole cycle.
create or replace function public.preserve_generated_image_url_not_null()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.image_url is null then
    new.image_url := coalesce(old.image_url, '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_preserve_generated_image_url_not_null on public.generated_images;
create trigger trg_preserve_generated_image_url_not_null
before update of image_url on public.generated_images
for each row
execute function public.preserve_generated_image_url_not_null();

notify pgrst, 'reload schema';

commit;
