alter table public.milestone_claims
  add column if not exists streak_started_on date;

create unique index if not exists uq_milestone_claims_user_streak_day
  on public.milestone_claims(user_id, streak_started_on, day_milestone)
  where streak_started_on is not null;

drop policy if exists "User insert own checkins" on public.daily_check_ins;
drop policy if exists "User insert own milestones" on public.milestone_claims;

revoke insert, update, delete on table public.daily_check_ins from authenticated;
revoke insert, update, delete on table public.milestone_claims from authenticated;

grant select on table public.daily_check_ins to authenticated;
grant select on table public.milestone_claims to authenticated;
