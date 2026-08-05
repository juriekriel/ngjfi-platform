-- ============================================================================
-- The Jesus Index — data spaces (migration 0009)
--
-- THE PROBLEM THIS CLOSES
-- The sandbox needs the synthetic set to exist permanently: door 03 of the
-- landing page is a live walk through 26 invented organisations. The published
-- Index needs a pool that has never contained a fabricated row. Until now those
-- two requirements collided — `collab_intelligence()` joined `organisations`
-- with no `is_demo` filter, so the first real organisation's data would have
-- landed in a pool that was ~95% fiction, and /intelligence would have been
-- unpublishable.
--
-- The fix is not "remember to add a WHERE clause". It is two enforced spaces:
--
--   LIVE  — real organisations, real respondents. What /intelligence publishes.
--   DEMO  — synthetic organisations, flagged is_demo. What the sandbox reads.
--
-- Enforced, not merely filtered:
--   * the real analytics function cannot see demo rows — the filter is inside
--     the SECURITY DEFINER body, not a caller's responsibility;
--   * an organisation cannot change space once it holds responses, so real data
--     can never be relabelled as demo and demo data can never be laundered into
--     the published Index;
--   * a slug can never collide across spaces;
--   * the published view stays empty until a geography passes the critical-mass
--     gate, so /intelligence cannot publish a global picture built on nine
--     responses — which would break the integrity line more quietly, but just as
--     badly, as the demo would;
--   * `data_space_report()` lets anyone VERIFY the separation with a live query
--     rather than by reading this file, which is what the definition of done
--     actually requires.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Platform settings. The critical-mass gate is DATA, not a constant in code —
-- the working number is a placeholder, not a finding, and the researchers must
-- be able to move it without a deploy.
-- ----------------------------------------------------------------------------
create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  note        text,
  updated_at  timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

create policy "settings are publicly readable"
  on public.platform_settings for select using (true);

insert into public.platform_settings (key, value, note) values
  ('critical_mass_gate', '400'::jsonb,
   'Completed responses required in a geography before any benchmark for it is published. A placeholder, not a finding — see the open questions on /learn.'),
  ('publish_global_view', 'false'::jsonb,
   'While false, /intelligence reports its honest empty state instead of a global picture. Flip to true only once the live space has crossed the gate.')
on conflict (key) do nothing;

create or replace function public.setting_int(p_key text, p_default int)
returns int language sql stable set search_path = public as $$
  select coalesce((select value::text::int from platform_settings where key = p_key), p_default);
$$;

create or replace function public.setting_bool(p_key text, p_default boolean)
returns boolean language sql stable set search_path = public as $$
  select coalesce((select value::text::boolean from platform_settings where key = p_key), p_default);
$$;

-- ----------------------------------------------------------------------------
-- A space cannot change under an organisation that already holds data.
-- Without this, one UPDATE could move 79,000 fabricated responses into the
-- published Index, and no amount of care in the application would stop it.
-- ----------------------------------------------------------------------------
create or replace function public.lock_data_space()
returns trigger language plpgsql set search_path = public as $$
declare v_rows bigint;
begin
  if new.is_demo is distinct from old.is_demo then
    select count(*) into v_rows
      from responses rsp
      join sessions s  on s.id = rsp.session_id
      join campaigns c on c.id = s.campaign_id
     where c.org_id = old.id;

    if v_rows > 0 then
      raise exception
        'organisation "%" already holds % responses; its data space cannot be changed. Create a new organisation instead.',
        old.slug, v_rows;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists organisations_lock_data_space on public.organisations;
create trigger organisations_lock_data_space
  before update on public.organisations
  for each row execute function public.lock_data_space();

-- Slugs are already unique, which means a real organisation can never claim a
-- slug a demo organisation holds. Make the intent explicit for the next reader.
comment on column public.organisations.is_demo is
  'The data space. true = synthetic sandbox, excluded from every published figure. false = live. Immutable once the organisation holds responses (see trigger organisations_lock_data_space).';

-- ----------------------------------------------------------------------------
-- The published view. Live space only, and honest about being empty.
--
-- Replaces the unfiltered collab_intelligence() from 0005. Same return shape,
-- so nothing in the app changes except what it is allowed to see.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb; v_gate int; v_total bigint; v_publish boolean;
begin
  v_gate    := setting_int('critical_mass_gate', 400);
  v_publish := setting_bool('publish_global_view', false);

  select count(distinct s.id) into v_total
    from sessions s
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
   where o.is_demo = false;

  -- Never overclaim. Below the gate there is no global picture to report, and
  -- saying so plainly is the whole discipline.
  if not v_publish or v_total < v_gate then
    return jsonb_build_object(
      'space',     'live',
      'published', false,
      'reason',    case when not v_publish then 'awaiting_release' else 'below_critical_mass' end,
      'gate',      v_gate,
      'completions', v_total,
      'headline',  jsonb_build_object('responses', 0, 'orgs', 0, 'countries', 0, 'regions', 0, 'languages', 0)
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = false          -- <<< the line this migration exists for
  ),
  ctry_n as (select country, count(distinct sid) n from r where country is not null group by country)
  select jsonb_build_object(
    'space', 'live',
    'published', true,
    'gate', v_gate,
    'headline', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                   where tier = 'multiplication' and age_band is not null group by age_band) a),
    'regions', (select jsonb_agg(jsonb_build_object('region', region, 'index', m, 'responses', n) order by m desc) from
                 (select region, round(avg(normalized),1) m, count(distinct sid) n from r where region is not null group by region) g),
    -- Only geographies past the gate are ever named with a score.
    'countries', (select jsonb_agg(jsonb_build_object('country', country, 'n', n)) from ctry_n where n >= v_gate)
  ) into result;

  return result;
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- The sandbox's own view. Demo space only, and it says so in the payload so the
-- UI is obliged to label it. Mirrors the pattern 0006 established.
-- ----------------------------------------------------------------------------
create or replace function public.collab_intelligence_demo()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid, s.created_at,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s      on s.id = rsp.session_id
    join campaigns c     on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
      and o.is_demo = true           -- the fiction, aggregated only within itself
  )
  select jsonb_build_object(
    'space', 'demo',
    'published', true,
    'demo', true,
    'headline', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                   where tier = 'multiplication' and age_band is not null group by age_band) a),
    'regions', (select jsonb_agg(jsonb_build_object('region', region, 'index', m, 'responses', n) order by m desc) from
                 (select region, round(avg(normalized),1) m, count(distinct sid) n from r where region is not null group by region) g),
    'countries', (select jsonb_agg(jsonb_build_object('country', country, 'n', n)) from
                   (select country, count(distinct sid) n from r where country is not null group by country) c)
  ) into result;
  return result;
end;
$$;

grant execute on function public.collab_intelligence_demo() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Verify the separation with a live query, not by reading SQL.
--   select public.data_space_report();
-- Run it after every seed, before every announcement, and in CI against a
-- throwaway database. If `live.responses` is not what you expect, stop.
-- ----------------------------------------------------------------------------
create or replace function public.data_space_report()
returns jsonb
language sql security definer set search_path = public as $$
  with per as (
    select o.is_demo,
           count(distinct o.id)  as orgs,
           count(distinct s.id)  as sessions,
           count(rsp.id)         as responses
      from organisations o
      left join campaigns c on c.org_id = o.id
      left join sessions  s on s.campaign_id = c.id
      left join responses rsp on rsp.session_id = s.id
     group by o.is_demo
  )
  select jsonb_build_object(
    'live', coalesce((select jsonb_build_object('orgs', orgs, 'sessions', sessions, 'responses', responses)
                        from per where is_demo = false), jsonb_build_object('orgs',0,'sessions',0,'responses',0)),
    'demo', coalesce((select jsonb_build_object('orgs', orgs, 'sessions', sessions, 'responses', responses)
                        from per where is_demo = true),  jsonb_build_object('orgs',0,'sessions',0,'responses',0)),
    'gate', setting_int('critical_mass_gate', 400),
    'global_view_published', setting_bool('publish_global_view', false),
    'checked_at', now()
  );
$$;

grant execute on function public.data_space_report() to anon, authenticated;
