-- ============================================================================
-- The Jesus Index — org-facing benchmark comparison (migration 0017)
--
-- Item 7 from the batch request: a comparison toggle on an org's own
-- dashboard, contrasting their result against a country baseline and a
-- global baseline. Same critical-mass discipline as collab_intelligence():
-- a number is never shown for a geography that has not passed the gate, and
-- every figure that IS shown carries its own n.
--
-- Deliberately excludes the requesting org's own responses from whichever
-- baseline it is being compared against — "how do you compare to others",
-- not "how do you compare to a pool you are already part of".
-- ============================================================================

create or replace function public.org_benchmark(p_org_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org public.organisations%rowtype;
  v_gate int;
  v_publish_global boolean;
  v_country_n bigint;
  v_country_tiers jsonb;
  v_country_index numeric;
  v_global_n bigint;
  v_global_tiers jsonb;
  v_global_index numeric;
begin
  select * into v_org from organisations where slug = p_org_slug;
  if not found then raise exception 'org not found'; end if;

  if v_uid is null or not exists (
    select 1 from org_members m where m.org_id = v_org.id and m.user_id = v_uid and m.status = 'active'
  ) then
    raise exception 'not authorised for this organisation';
  end if;

  v_gate := setting_int('critical_mass_gate', 400);
  v_publish_global := setting_bool('publish_global_view', false);

  -- Country baseline: same country, live space, every org except this one.
  if v_org.country is not null then
    with country_r as (
      select rsp.tier, rsp.normalized, s.id as sid
      from responses rsp
      join sessions s      on s.id = rsp.session_id
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
      where o.is_demo = false
        and o.country = v_org.country
        and o.id <> v_org.id
        and rsp.normalized is not null
    )
    select
      (select count(distinct sid) from country_r),
      (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from country_r group by tier) t)
    into v_country_n, v_country_tiers;
  end if;

  if v_country_n >= v_gate then
    select round(avg(value::numeric),1) into v_country_index
    from jsonb_each_text(coalesce(v_country_tiers, '{}'::jsonb))
    where key in ('exposure','response','formation','multiplication');
  else
    v_country_tiers := null;
  end if;

  -- Global baseline: every country, live space, every org except this one —
  -- gated on BOTH the critical-mass count and the separate publish_global_view
  -- switch, matching collab_intelligence()'s own public-facing gate. A number
  -- not fit to publish on /intelligence should not reach an org privately either.
  if v_publish_global then
    with global_r as (
      select rsp.tier, rsp.normalized, s.id as sid
      from responses rsp
      join sessions s      on s.id = rsp.session_id
      join campaigns c     on c.id = s.campaign_id
      join organisations o on o.id = c.org_id
      where o.is_demo = false
        and o.id <> v_org.id
        and rsp.normalized is not null
    )
    select
      (select count(distinct sid) from global_r),
      (select jsonb_object_agg(tier, m) from (select tier, round(avg(normalized),1) m from global_r group by tier) t)
    into v_global_n, v_global_tiers;
  end if;

  if v_global_n >= v_gate then
    select round(avg(value::numeric),1) into v_global_index
    from jsonb_each_text(coalesce(v_global_tiers, '{}'::jsonb))
    where key in ('exposure','response','formation','multiplication');
  else
    v_global_tiers := null;
  end if;

  return jsonb_build_object(
    'gate', v_gate,
    'country', jsonb_build_object(
      'geography', v_org.country,
      'available', v_country_n >= v_gate,
      'n', coalesce(v_country_n, 0),
      'index', v_country_index,
      'tiers', v_country_tiers
    ),
    'global', jsonb_build_object(
      'available', v_publish_global and v_global_n >= v_gate,
      'n', coalesce(v_global_n, 0),
      'index', v_global_index,
      'tiers', v_global_tiers
    )
  );
end;
$$;

grant execute on function public.org_benchmark(text) to authenticated;
