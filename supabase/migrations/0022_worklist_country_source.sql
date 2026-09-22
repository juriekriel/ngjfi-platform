-- ============================================================================
-- The Jesus Index — collab_worklist() country source, reconciled (migration 0022)
--
-- Flagged in the review that produced migrations 0020/0021 and left for a
-- separate change: collab_worklist() ranked countries by sessions.country
-- (the respondent's own self-reported demographic answer) while every other
-- geography query on the platform — collab_intelligence()'s countries[],
-- org_benchmark()'s country baseline, the regions rollups — uses
-- organisations.country (the organisation's registered country).
--
-- Two different things were both called "country" and silently disagreed:
-- a Kenyan respondent answering a UK-registered ministry's survey while
-- travelling would count toward Kenya in the worklist ("Kenya needs 40 more
-- completions") but toward the UK everywhere else the platform names a
-- country. Concentration is the whole point of this worklist's ranking
-- ("the same sixty organisations spread across forty countries unlocks
-- nothing; concentrated in ten it unlocks all ten") — a worklist counting a
-- different "country" than the gate it's steering toward can recommend
-- effort that never actually closes the gap collab_intelligence() checks.
--
-- Fix: collab_worklist() now uses organisations.country, matching
-- collab_intelligence() and org_benchmark(). This is the only change —
-- ranking logic, the "never fielded" nudge, and the returned shape are
-- otherwise identical to the version in migration 0014.
--
-- Deliberately NOT a schema change: sessions.country (the respondent's own
-- answer) still exists and is still collected — this migration only changes
-- which "country" collab_worklist() reads for its own ranking, to agree with
-- the rest of the platform. Whether a future rollup should ever use the
-- respondent's self-reported country instead of the organisation's is a
-- separate, larger question this migration deliberately does not settle.
-- ============================================================================

create or replace function public.collab_worklist()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_items jsonb := '[]'::jsonb; v_gate int; v_c bigint;
begin
  if my_role() not in ('admin', 'collab') then
    raise exception 'not authorised';
  end if;

  v_gate := setting_int('country_critical_mass_gate', 2000);

  -- Coverage, not volume. The same sixty organisations spread across forty
  -- countries unlocks nothing; concentrated in ten it unlocks all ten. So the
  -- worklist ranks by who is CLOSEST to a benchmark, not by who has the most.
  --
  -- o.country, not s.country: this must count completions the same way
  -- collab_intelligence()'s countries[] does, or "Kenya is 40 away" can
  -- describe a gap that closing doesn't actually close.
  v_items := (
    select coalesce(jsonb_agg(jsonb_build_object(
             'urgency', 'high',
             'label', x.country || ' is ' || (v_gate - x.completions)
                      || ' completions from its first benchmark',
             'meta', x.completions || ' / ' || v_gate,
             'action', 'See who can close it')
           order by x.completions desc), '[]'::jsonb)
      from (
        select o.country, count(*) as completions
          from sessions s
          join campaigns c on c.id = s.campaign_id
          join organisations o on o.id = c.org_id
         where s.completed and o.is_demo = false and o.country is not null
         group by o.country
        having count(*) < v_gate
      ) x
  );

  select count(*) into v_c
    from organisations o
   where o.is_demo = false
     and not exists (select 1 from campaigns c where c.org_id = o.id and c.active);
  if v_c > 0 then
    v_items := v_items || jsonb_build_object(
      'urgency', 'high',
      'label', v_c || ' organisation' || case when v_c = 1 then '' else 's' end
        || ' joined and never fielded', 'action', 'Nudge');
  end if;

  return jsonb_build_object(
    'gate',  v_gate,
    'waves', coalesce((
      select jsonb_agg(jsonb_build_object(
               'short_name', w.short_name, 'name', w.name, 'item_set', w.item_set,
               'audiences', w.audiences, 'opens_on', w.opens_on, 'closes_on', w.closes_on,
               'adopted', (select count(*) from wave_adoptions a where a.wave_id = w.id))
             order by w.created_at desc)
        from waves w where w.is_demo = false), '[]'::jsonb),
    'items', v_items
  );
end;
$$;

grant execute on function public.collab_worklist() to authenticated;
