-- 0055 · The 30-minute setup call — tracked, and followed up.
--
-- Before this: "Would you join a 30-minute setup call?" offered Yes / Maybe /
-- No, but the column was a boolean, so "Maybe" was stored as nothing; and the
-- request only showed in the admin queue until the application was turned
-- into an organisation, then disappeared — nobody could see who still needed
-- a call.
--
-- Now:
--   waitlist_contacts.setup_call             'yes' | 'maybe' | 'no' (null = not answered)
--   waitlist_contacts.setup_call_emailed_at  when an administrator followed up
--   waitlist_contacts.setup_call_emailed_by  who did
--   admin_setup_calls()                      every yes / maybe, whatever the
--                                            application's status, newest first
--   admin_mark_setup_call(id, emailed)       tick it off (or undo)
--
-- waitlist_qualify() now takes 'setup_call' (and still accepts the old
-- 'wants_setup_call' boolean from cached pages). wants_setup_call is kept in
-- step (true only for 'yes') so the priority score and older readers agree.
-- The join form no longer asks how discipleship is measured, what decision the
-- score would change, or whether the organisation is in the Collab; those
-- columns stay (existing answers are kept) and are simply no longer written.
--
-- Adult staff contact details only — never joined to respondents.

alter table public.waitlist_contacts
  add column if not exists setup_call text,
  add column if not exists setup_call_emailed_at timestamptz,
  add column if not exists setup_call_emailed_by uuid references auth.users(id) on delete set null;

alter table public.waitlist_contacts drop constraint if exists waitlist_contacts_setup_call_check;
alter table public.waitlist_contacts
  add constraint waitlist_contacts_setup_call_check check (setup_call is null or setup_call in ('yes', 'maybe', 'no'));

update public.waitlist_contacts
   set setup_call = case when wants_setup_call then 'yes' else 'no' end
 where setup_call is null and wants_setup_call is not null;


create or replace function public.waitlist_qualify(
  p_email text, p_payload jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_email citext; v_countries text[]; v_primary text; v_score int := 0; v_peers int; v_call text;
begin
  v_email := lower(btrim(p_email))::citext;
  if not exists (select 1 from waitlist_contacts w where w.email = v_email) then
    raise exception 'not on the list yet';
  end if;

  v_call := lower(nullif(btrim(coalesce(
              p_payload->>'setup_call',
              case (p_payload->>'wants_setup_call') when 'true' then 'yes' when 'false' then 'no' end
            , '')), ''));
  if v_call is not null and v_call not in ('yes', 'maybe', 'no') then v_call := null; end if;

  select array(select left(btrim(x), 80) from jsonb_array_elements_text(
           coalesce(p_payload->'countries', '[]'::jsonb)) x where btrim(x) <> '')
    into v_countries;
  v_primary := v_countries[1];

  update waitlist_contacts w set
    countries           = nullif(v_countries, '{}'),
    primary_country     = v_primary,
    reach_band          = left(nullif(btrim(p_payload->>'reach_band'), ''), 40),
    languages           = nullif(array(select left(btrim(x), 60)
                            from jsonb_array_elements_text(coalesce(p_payload->'languages','[]'::jsonb)) x
                            where btrim(x) <> ''), '{}'),
    -- Retired questions: an answer is kept if one is sent, never wiped if not.
    measures_today      = coalesce(left(nullif(btrim(p_payload->>'measures_today'), ''), 2000), w.measures_today),
    decision_it_changes = coalesce(left(nullif(btrim(p_payload->>'decision_it_changes'), ''), 2000), w.decision_it_changes),
    is_collab_member    = coalesce((p_payload->>'is_collab_member')::boolean, w.is_collab_member),
    setup_call          = v_call,
    wants_setup_call    = case v_call when 'yes' then true when 'no' then false when 'maybe' then false else null end,
    status              = case when w.status = 'new' then 'qualified' else w.status end,
    updated_at          = now()
  where w.email = v_email;

  -- Priority orders cluster assembly (weights as in 0008, legible on purpose).
  select count(*) into v_peers
    from waitlist_contacts w
   where v_primary is not null and w.primary_country = v_primary and w.email <> v_email;

  select coalesce(
    (case when v_peers >= 3 then 40 else 0 end)
  + 25
  + (case when v_call = 'yes' then 20 when v_call = 'maybe' then 10 else 0 end)
  + (case when (select is_collab_member from waitlist_contacts where email = v_email) then 15 else 0 end)
  + (case when p_payload->>'reach_band' in ('500–2,000','2,000–10,000','10,000+') then 10 else 0 end)
  + 5 * (select count(*) from waitlist_contacts r
          where r.referred_by = (select id from waitlist_contacts where email = v_email))
  , 0) into v_score;

  update waitlist_contacts set priority_score = v_score where email = v_email;
end;
$$;
grant execute on function public.waitlist_qualify(text, jsonb) to anon, authenticated;


create or replace function public.admin_setup_calls()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can see setup calls'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'email', w.email, 'org_name', w.org_name, 'role', w.role,
      'country', w.primary_country, 'reach_band', w.reach_band, 'languages', w.languages,
      'setup_call', w.setup_call, 'status', w.status, 'created_at', w.created_at,
      'emailed_at', w.setup_call_emailed_at,
      'emailed_by', (select u.email from app_users u where u.id = w.setup_call_emailed_by)
    ) order by (w.setup_call_emailed_at is not null), (w.setup_call = 'maybe'), w.created_at desc)
    from waitlist_contacts w
    where w.setup_call in ('yes', 'maybe') and w.status not in ('declined', 'bounced')
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.admin_setup_calls() to authenticated;


create or replace function public.admin_mark_setup_call(p_id uuid, p_emailed boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'admin' then raise exception 'only an administrator can follow up setup calls'; end if;
  update waitlist_contacts
     set setup_call_emailed_at = case when p_emailed then now() else null end,
         setup_call_emailed_by = case when p_emailed then auth.uid() else null end,
         updated_at = now()
   where id = p_id;
  if not found then raise exception 'not found'; end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.admin_mark_setup_call(uuid, boolean) to authenticated;
