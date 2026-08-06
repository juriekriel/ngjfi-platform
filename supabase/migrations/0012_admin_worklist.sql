-- ============================================================================
-- The Jesus Index — the administrator's worklist (migration 0012)
--
-- One call behind the console. It is a WORKLIST, not a dashboard: the 2027
-- target is a chain of handovers that each need a person to notice them, so the
-- job of this function is to surface what is waiting on a human right now.
--
-- Everything it returns is aggregate or operational. It never returns an
-- individual response, because nothing does.
-- ============================================================================

create or replace function public.admin_worklist()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if my_role() <> 'admin' then
    raise exception 'the worklist is for administrators';
  end if;

  select jsonb_build_object(
    'access_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'email', a.email, 'reason', a.reason,
        'status', a.status, 'created_at', a.created_at
      ) order by a.created_at desc)
      from access_requests a where a.status = 'requested'
    ), '[]'::jsonb),

    'people', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'role', au.role) order by u.email)
      from app_users au join auth.users u on u.id = au.id
    ), '[]'::jsonb),

    -- Live organisations only. The 26 synthetic ones are not work.
    'organisations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'short_name', o.short_name, 'name', o.name, 'country', o.country,
        'verified', o.verified, 'has_brand', (o.logo_url is not null or o.brand_color is not null),
        'campaigns', (select count(*) from campaigns c where c.org_id = o.id),
        'responses', (
          select count(*) from responses r
          join sessions s on s.id = r.session_id
          join campaigns c on c.id = s.campaign_id
          where c.org_id = o.id
        )
      ) order by o.name)
      from organisations o where o.is_demo = false
    ), '[]'::jsonb),

    -- How close each country is to unlocking a benchmark for everyone in it.
    -- Concentration is the constraint, so this is the number that steers effort.
    'clusters', coalesce((
      select jsonb_agg(jsonb_build_object('country', country, 'completions', n, 'orgs', orgs)
                       order by n desc)
      from (
        select o.country, count(distinct s.id) n, count(distinct o.id) orgs
        from organisations o
        join campaigns c on c.org_id = o.id
        join sessions s on s.campaign_id = c.id
        where o.is_demo = false and o.country is not null
        group by o.country
      ) k
    ), '[]'::jsonb),

    'instrument', (
      select jsonb_build_object('version', iv.version, 'status', iv.status,
                                'items', (select count(*) from items i where i.instrument_version_id = iv.id))
      from instrument_versions iv where iv.status = 'active' limit 1
    ),

    'settings', coalesce((
      select jsonb_object_agg(key, value) from platform_settings
    ), '{}'::jsonb),

    'spaces', data_space_report()
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_worklist() to authenticated;

-- ----------------------------------------------------------------------------
-- Decide an access request. Approving records the decision; it does not grant a
-- tier — that stays a separate, deliberate act via set_user_role(), so nobody
-- becomes an administrator as a side effect of a queue being cleared.
-- ----------------------------------------------------------------------------
create or replace function public.decide_access_request(p_id uuid, p_decision text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then
    raise exception 'only an administrator can decide access requests';
  end if;
  if p_decision not in ('approved', 'declined') then
    raise exception 'decision must be approved or declined';
  end if;
  update access_requests
     set status = p_decision, decided_at = now()
   where id = p_id and status = 'requested';
end;
$$;

grant execute on function public.decide_access_request(uuid, text) to authenticated;
