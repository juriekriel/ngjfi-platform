-- ============================================================================
-- NGJFI platform — public demo dashboard (migration 0006)
--
-- The prototype at jfindx.org has to be walkable end-to-end with no sign-in.
-- `org_dashboard` stays exactly as it is: membership-gated, for real ministries.
-- This adds a sibling that returns the SAME aggregate shape but ONLY for
-- organisations flagged `is_demo = true`, and grants it to `anon`.
--
-- Safety properties:
--   * hard-fails on any org where is_demo is false — no real ministry can leak
--     through this path, now or after real data lands;
--   * returns aggregates only (means and counts), never a raw response row;
--   * carries `demo: true` in the payload so the UI must label it;
--   * neutralised by supabase/delete_demo_data.sql teardown, since that deletes
--     the demo orgs this function is restricted to.
-- ============================================================================

create or replace function public.org_dashboard_demo(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org public.organisations%rowtype; result jsonb;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;
  if not coalesce(v_org.is_demo, false) then
    raise exception 'demo preview is only available for demo organisations';
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized, s.created_at
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'demo', true,
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', (select count(*) from r),
    'tiers',   (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m from r group by question_domain, tier) x
                  group by question_domain) y),
    'items',   (select jsonb_agg(jsonb_build_object('key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, round(avg(normalized),1) m, count(*) n
                    from r group by item_key, question_domain, tier) z),
    'trend',   (select jsonb_agg(jsonb_build_object('year', yr, 'index', idx) order by yr) from
                 (select yr, round(avg(tm),1) idx from
                    (select extract(year from created_at)::int yr, tier, avg(normalized) tm
                       from r group by extract(year from created_at)::int, tier) a
                  group by yr) b)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
       where key in ('exposure','response','formation','multiplication')));
  return result;
end;
$$;

grant execute on function public.org_dashboard_demo(text) to anon, authenticated;

-- Convenience for the prototype landing: which orgs can be previewed publicly.
create or replace function public.demo_orgs()
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name) order by name), '[]'::jsonb)
  from organisations where is_demo = true;
$$;

grant execute on function public.demo_orgs() to anon, authenticated;
