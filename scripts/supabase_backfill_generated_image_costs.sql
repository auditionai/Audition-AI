-- Audition AI
-- Backfill legacy generated_images.cost_vcoin from vcoin_transactions
--
-- Goal:
-- 1. Fill old generated_images rows that still have null/invalid cost_vcoin
-- 2. Prefer exact matches from transaction metadata/reference ids
-- 3. Only use time-based heuristic when the match is uniquely safe
--
-- Safe to run multiple times.

begin;

create temp table tmp_generated_image_cost_candidates (
    generated_image_id uuid not null,
    transaction_id uuid not null,
    cost_vcoin integer not null,
    match_stage integer not null,
    match_rule text not null,
    delta_seconds numeric not null default 0
);

create temp table tmp_generated_image_cost_backfilled (
    generated_image_id uuid not null,
    transaction_id uuid not null,
    cost_vcoin integer not null,
    match_stage integer not null,
    match_rule text not null
);

-- Stage 1: Exact match by vcoin_transactions.reference_id = generated_images.id
insert into tmp_generated_image_cost_candidates (
    generated_image_id,
    transaction_id,
    cost_vcoin,
    match_stage,
    match_rule,
    delta_seconds
)
select
    gi.id,
    vt.id,
    abs(round(vt.amount))::integer,
    1,
    'reference_id = generated_images.id',
    abs(extract(epoch from (coalesce(vt.created_at, gi.created_at, now()) - coalesce(gi.created_at, vt.created_at, now()))))
from public.generated_images gi
join public.vcoin_transactions vt
    on vt.user_id = gi.user_id
   and vt.amount < 0
   and coalesce(vt.reference_id, '') = gi.id::text
where coalesce(gi.cost_vcoin, 0) <= 0
  and gi.user_id is not null;

-- Stage 2: Exact match by vcoin_transactions.metadata.generated_image_id
insert into tmp_generated_image_cost_candidates (
    generated_image_id,
    transaction_id,
    cost_vcoin,
    match_stage,
    match_rule,
    delta_seconds
)
select
    gi.id,
    vt.id,
    abs(round(vt.amount))::integer,
    2,
    'metadata.generated_image_id = generated_images.id',
    abs(extract(epoch from (coalesce(vt.created_at, gi.created_at, now()) - coalesce(gi.created_at, vt.created_at, now()))))
from public.generated_images gi
join public.vcoin_transactions vt
    on vt.user_id = gi.user_id
   and vt.amount < 0
   and coalesce(vt.metadata ->> 'generated_image_id', '') = gi.id::text
where coalesce(gi.cost_vcoin, 0) <= 0
  and gi.user_id is not null;

-- Stage 3: Exact match by vcoin_transactions.reference_id = generated_images.job_id
insert into tmp_generated_image_cost_candidates (
    generated_image_id,
    transaction_id,
    cost_vcoin,
    match_stage,
    match_rule,
    delta_seconds
)
select
    gi.id,
    vt.id,
    abs(round(vt.amount))::integer,
    3,
    'reference_id = generated_images.job_id',
    abs(extract(epoch from (coalesce(vt.created_at, gi.created_at, now()) - coalesce(gi.created_at, vt.created_at, now()))))
from public.generated_images gi
join public.vcoin_transactions vt
    on vt.user_id = gi.user_id
   and vt.amount < 0
   and gi.job_id is not null
   and coalesce(vt.reference_id, '') = gi.job_id
where coalesce(gi.cost_vcoin, 0) <= 0
  and gi.user_id is not null;

-- Stage 4: Exact match by vcoin_transactions.metadata.job_id = generated_images.job_id
insert into tmp_generated_image_cost_candidates (
    generated_image_id,
    transaction_id,
    cost_vcoin,
    match_stage,
    match_rule,
    delta_seconds
)
select
    gi.id,
    vt.id,
    abs(round(vt.amount))::integer,
    4,
    'metadata.job_id = generated_images.job_id',
    abs(extract(epoch from (coalesce(vt.created_at, gi.created_at, now()) - coalesce(gi.created_at, vt.created_at, now()))))
from public.generated_images gi
join public.vcoin_transactions vt
    on vt.user_id = gi.user_id
   and vt.amount < 0
   and gi.job_id is not null
   and coalesce(vt.metadata ->> 'job_id', '') = gi.job_id
where coalesce(gi.cost_vcoin, 0) <= 0
  and gi.user_id is not null;

-- Stage 5: Safe heuristic by same user + closest usage transaction in a short window.
-- Only accepted when the generated_images row and the transaction uniquely choose each other.
with missing_jobs as (
    select
        gi.id,
        gi.user_id,
        gi.created_at,
        gi.job_id
    from public.generated_images gi
    where coalesce(gi.cost_vcoin, 0) <= 0
      and gi.user_id is not null
),
legacy_usage_transactions as (
    select
        vt.id,
        vt.user_id,
        vt.created_at,
        abs(round(vt.amount))::integer as cost_vcoin
    from public.vcoin_transactions vt
    where vt.amount < 0
      and lower(coalesce(vt.type, '')) = 'usage'
      and not exists (
          select 1
          from tmp_generated_image_cost_candidates c
          where c.transaction_id = vt.id
            and c.match_stage between 1 and 4
      )
),
candidate_pairs as (
    select
        gi.id as generated_image_id,
        vt.id as transaction_id,
        vt.cost_vcoin,
        abs(extract(epoch from (coalesce(vt.created_at, gi.created_at, now()) - coalesce(gi.created_at, vt.created_at, now())))) as delta_seconds,
        row_number() over (
            partition by gi.id
            order by abs(extract(epoch from (coalesce(vt.created_at, gi.created_at, now()) - coalesce(gi.created_at, vt.created_at, now())))), vt.created_at, vt.id
        ) as image_rank,
        row_number() over (
            partition by vt.id
            order by abs(extract(epoch from (coalesce(vt.created_at, gi.created_at, now()) - coalesce(gi.created_at, vt.created_at, now())))), gi.created_at, gi.id
        ) as tx_rank
    from missing_jobs gi
    join legacy_usage_transactions vt
        on vt.user_id = gi.user_id
       and vt.created_at between gi.created_at - interval '10 minutes' and gi.created_at + interval '10 minutes'
)
insert into tmp_generated_image_cost_candidates (
    generated_image_id,
    transaction_id,
    cost_vcoin,
    match_stage,
    match_rule,
    delta_seconds
)
select
    cp.generated_image_id,
    cp.transaction_id,
    cp.cost_vcoin,
    5,
    'heuristic: same user + unique nearest usage transaction within 10 minutes',
    cp.delta_seconds
from candidate_pairs cp
where cp.image_rank = 1
  and cp.tx_rank = 1;

with ranked_matches as (
    select
        c.generated_image_id,
        c.transaction_id,
        c.cost_vcoin,
        c.match_stage,
        c.match_rule,
        row_number() over (
            partition by c.generated_image_id
            order by c.match_stage asc, c.delta_seconds asc, c.transaction_id asc
        ) as generated_image_rank,
        row_number() over (
            partition by c.transaction_id
            order by c.match_stage asc, c.delta_seconds asc, c.generated_image_id asc
        ) as transaction_rank
    from tmp_generated_image_cost_candidates c
),
resolved_matches as (
    select
        rm.generated_image_id,
        rm.transaction_id,
        rm.cost_vcoin,
        rm.match_stage,
        rm.match_rule
    from ranked_matches rm
    where rm.generated_image_rank = 1
      and rm.transaction_rank = 1
),
updated_rows as (
    update public.generated_images gi
    set cost_vcoin = rm.cost_vcoin
    from resolved_matches rm
    where gi.id = rm.generated_image_id
      and coalesce(gi.cost_vcoin, 0) <= 0
    returning
        gi.id as generated_image_id,
        rm.transaction_id,
        rm.cost_vcoin,
        rm.match_stage,
        rm.match_rule
)
insert into tmp_generated_image_cost_backfilled (
    generated_image_id,
    transaction_id,
    cost_vcoin,
    match_stage,
    match_rule
)
select
    generated_image_id,
    transaction_id,
    cost_vcoin,
    match_stage,
    match_rule
from updated_rows;

commit;

-- Summary
select
    count(*) as backfilled_rows
from tmp_generated_image_cost_backfilled;

select
    match_stage,
    match_rule,
    count(*) as rows_backfilled
from tmp_generated_image_cost_backfilled
group by match_stage, match_rule
order by match_stage;

select
    count(*) as remaining_rows_without_cost
from public.generated_images
where coalesce(cost_vcoin, 0) <= 0;
