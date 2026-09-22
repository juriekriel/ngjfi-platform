-- ============================================================================
-- The Jesus Index — reconcile org_dashboard_demo() with org_dashboard() (migration 0023)
--
-- Flagged during the Drivers/Journey reporting review and left for a
-- separate change: org_dashboard_demo() (the signed-out /demo/dashboard
-- preview) was never updated when migration 0019 fixed org_dashboard() —
-- it drifted on three points:
--
--   1. No min_group_n floor. A demo org with a handful of synthetic
--      responses could still show a derived score, which is exactly the
--      suppression 0019 added everywhere else on the platform.
--   2. The same n-counting bug 0019 fixed in org_dashboard(): 'n' was
--      count(*) over response ROWS (one row per item answered), not
--      count(distinct session) — a 3-respondent demo org answering a
--      24-item Index reported n=72, not 3.
--   3. Trend computed inline from raw responses instead of via
--      blended_trend(), so a demo org's "movement over time" ignores
--      the retention-archive blending every other trend chart already
--      gets.
--
-- Fix: org_dashboard_demo()'s body is now structurally identical to
-- org_dashboard()'s (post-0021), with only the is_demo guard and the anon
-- grant kept — both of which are this function's entire reason to exist as
-- a separate sibling rather than reusing org_dashboard() directly. This
-- includes migration 0021's 'insights' key (Drivers/Journey option rates),
-- now that 0021 has merged — the demo preview should show the same panels
-- the real dashboard does, not a strict subset of them.
-- ============================================================================

create or replace function public.org_dashboard_demo(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organisations%rowtype; result jsonb;
  v_n bigint; v_min_group_n int;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if not coalesce(v_org.is_demo, false) then
    raise exception 'demo preview is only available for demo organisations';
  end if;

  v_min_group_n := setting_int('min_group_n', 10);

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select count(distinct sid) into v_n from r;

  -- Same suppression as org_dashboard(): n is real and always shown,
  -- everything derived from it is not, below the floor.
  if v_n < v_min_group_n then
    return jsonb_build_object(
      'demo', true,
      'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
      'n', v_n,
      'suppressed', true,
      'min_group_n', v_min_group_n,
      'index', null, 'tiers', '{}'::jsonb, 'domains', '{}'::jsonb, 'matrix', '{}'::jsonb,
      'items', '[]'::jsonb, 'trend', null, 'insights', '{}'::jsonb
    );
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at, s.id as sid
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'demo', true,
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', v_n,
    'suppressed', false,
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'items',   (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, round(avg(normalized),1) m, count(distinct sid) n
                    from r group by item_key, question_domain, tier) z),
    'trend',   blended_trend(v_org.id, v_org.is_demo),
    'insights', insight_aggregates(v_org.id, v_org.is_demo, v_min_group_n)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
       where key in ('exposure','response','formation','multiplication')));
  return result;
end;
$$;

grant execute on function public.org_dashboard_demo(text) to anon, authenticated;
