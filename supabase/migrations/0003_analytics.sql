-- ============================================================================
-- NGJFI platform — analytics RPCs (migration 0003)
--   * collab_intelligence(): aggregate cross-org picture (anon-readable; aggregates only)
--   * org_dashboard(): extended with 3x4 matrix + per-item means (membership-gated)
-- ============================================================================

create or replace function public.collab_intelligence()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  with r as (
    select rsp.tier, rsp.question_domain, rsp.normalized,
           s.age_band, s.locale, s.id as sid,
           o.region, o.country, o.id as oid
    from responses rsp
    join sessions s     on s.id = rsp.session_id
    join campaigns c    on c.id = s.campaign_id
    join organisations o on o.id = c.org_id
    where rsp.normalized is not null
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'responses', (select count(distinct sid) from r),
      'orgs',      (select count(distinct oid) from r),
      'countries', (select count(distinct country) from r where country is not null),
      'regions',   (select count(distinct region) from r where region is not null),
      'languages', (select count(distinct locale) from r where locale is not null)
    ),
    'funnel',  (select jsonb_object_agg(tier, m) from
                 (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from
                 (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m
                       from r group by question_domain, tier) x
                  group by question_domain) y),
    'by_age',  (select jsonb_object_agg(age_band, m) from
                 (select age_band, round(avg(normalized),1) m from r
                    where tier = 'multiplication' and age_band is not null
                    group by age_band) a),
    'regions', (select jsonb_agg(jsonb_build_object('region', region, 'index', m, 'responses', n)
                          order by m desc) from
                 (select region, round(avg(normalized),1) m, count(distinct sid) n
                    from r where region is not null group by region) g)
  ) into result;
  return coalesce(result, '{}'::jsonb);
end;
$$;

grant execute on function public.collab_intelligence() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Extended org dashboard (aggregates only, membership-gated)
-- ----------------------------------------------------------------------------
create or replace function public.org_dashboard(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org public.organisations%rowtype; result jsonb;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m
    where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  with r as (
    select rsp.tier, rsp.question_domain, rsp.item_key, rsp.normalized
    from responses rsp
    join sessions s  on s.id = rsp.session_id
    join campaigns c on c.id = s.campaign_id
    where c.org_id = v_org.id and rsp.normalized is not null
  )
  select jsonb_build_object(
    'org', jsonb_build_object('slug', v_org.slug, 'name', v_org.name, 'verified', v_org.verified),
    'n', (select count(*) from r),
    'tiers',   (select jsonb_object_agg(tier, m) from
                 (select tier, round(avg(normalized),1) m from r group by tier) t),
    'domains', (select jsonb_object_agg(question_domain, m) from
                 (select question_domain, round(avg(normalized),1) m from r group by question_domain) d),
    'matrix',  (select jsonb_object_agg(question_domain, tiers) from
                 (select question_domain, jsonb_object_agg(tier, m) tiers from
                    (select question_domain, tier, round(avg(normalized),1) m
                       from r group by question_domain, tier) x
                  group by question_domain) y),
    'items',   (select jsonb_agg(jsonb_build_object(
                          'key', item_key, 'domain', question_domain, 'tier', tier, 'mean', m, 'n', n)
                          order by question_domain, tier) from
                 (select item_key, question_domain, tier, round(avg(normalized),1) m, count(*) n
                    from r group by item_key, question_domain, tier) z)
  ) into result;

  result := result || jsonb_build_object('index',
    (select round(avg(value::numeric),1) from jsonb_each_text(coalesce(result->'tiers','{}'::jsonb))
       where key in ('exposure','response','formation','multiplication')));

  return result;
end;
$$;

grant execute on function public.org_dashboard(text) to authenticated;
