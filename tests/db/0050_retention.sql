-- 0050: two-stage retention. 60 days → de-identified; purge only de-identified rows.
do $$
declare
  v_admin uuid := test.make_user('admin@test.local', 'admin');
  v_org   uuid := test.make_org('ret-org', true);
  v_link  uuid;
  s_old uuid; s_new uuid; r jsonb; before_mean numeric; after_mean numeric;
  v_ts timestamptz;
begin
  perform test.unlock();
  insert into distribution_links (org_id, name, slug) values (v_org, 'Camp night', 'camp') returning id into v_link;

  s_old := test.make_session(v_org, interval '61 days', 'Smalltown', v_link, 'Jesus is my friend', 60);
  s_new := test.make_session(v_org, interval '59 days', 'Smalltown', v_link, 'Still fresh', 40);

  select avg(normalized) into before_mean from responses where session_id = s_old and normalized is not null;
  select created_at into v_ts from sessions where id = s_old;

  -- not anyone: through the API, an org user is refused
  perform test.ok(test.via_api(test.make_user('org@test.local', 'org'), 'select public.deidentify_stale_sessions()')
                  like '%only an administrator%', 'an org user cannot de-identify');

  perform test.login(v_admin);
  r := public.deidentify_stale_sessions();
  perform test.ok((r->>'sessions_deidentified')::int = 1, 'exactly the 61-day session is de-identified: ' || r::text);
  perform test.ok((r->>'free_text_answers_removed')::int = 1, 'its free text is removed');

  -- the old session
  perform test.ok((select deidentified_at is not null from sessions where id = s_old), 'stamped deidentified_at');
  perform test.ok((select city is null from sessions where id = s_old), 'city deleted');
  perform test.ok((select country = 'Argentina' from sessions where id = s_old), 'country kept');
  perform test.ok((select distribution_link_id is null from sessions where id = s_old), 'room link folded');
  perform test.ok((select created_at = date_trunc('month', v_ts) from sessions where id = s_old), 'time truncated to the month');
  perform test.ok(not exists (select 1 from responses where session_id = s_old and created_at <> date_trunc('month', v_ts)),
                  'every answer carries the same coarse time');
  perform test.ok(not exists (select 1 from responses where session_id = s_old and item_key = 'who_is_jesus' and raw_value is not null),
                  'free text nulled');
  select avg(normalized) into after_mean from responses where session_id = s_old and normalized is not null;
  perform test.ok(after_mean = before_mean, 'scores are untouched');

  -- the fresh session is untouched
  perform test.ok((select deidentified_at is null and city = 'Smalltown' and distribution_link_id = v_link from sessions where id = s_new),
                  'a 59-day session keeps everything');

  -- idempotent
  r := public.deidentify_stale_sessions();
  perform test.ok((r->>'sessions_deidentified')::int = 0, 'second run touches nothing');

  -- demo orgs are exempt
  declare v_demo uuid;
  begin
    insert into organisations (slug, name, short_name, is_demo) values ('demo-org', 'Demo', 'demo-org', true) returning id into v_demo;
    perform test.make_session(v_demo, interval '400 days', 'Demo City');
    r := public.deidentify_stale_sessions();
    perform test.ok((r->>'sessions_deidentified')::int = 0, 'demo sessions are not touched');
  end;
end $$;

-- code_then_delete keeps the words for coding, with no link back
do $$
declare v_org uuid := test.make_org('code-org', true); r jsonb;
begin
  perform test.unlock();
  update platform_settings set value = '"code_then_delete"'::jsonb where key = 'deidentify_free_text';
  perform test.make_session(v_org, interval '70 days', null, null, 'He is the Son of God');
  perform test.login(test.make_user('admin2@test.local', 'admin'));
  r := public.deidentify_stale_sessions();
  perform test.ok((r->>'free_text_held_for_coding')::int = 1, 'copied for coding');
  perform test.ok(exists (select 1 from free_text_holding where text = 'He is the Son of God'), 'text held');
  perform test.ok(not exists (select 1 from information_schema.columns
                               where table_name = 'free_text_holding' and column_name in ('session_id', 'org_id', 'campaign_id')),
                  'holding table has no link back to a session or org');
end $$;

-- purge: de-identifies first and refuses nothing identifiable; readiness flags overdue rows
do $$
declare v_org uuid := test.make_org('purge-org', true); v_admin uuid := test.make_user('admin3@test.local', 'admin'); r jsonb; c jsonb;
begin
  perform test.unlock();
  perform test.ok((select value = '60'::jsonb from platform_settings where key = 'respondent_retention_months'), 'retention set to 60 months');
  perform test.make_session(v_org, interval '62 months', 'Oldtown');
  perform test.make_session(v_org, interval '90 days', 'Midtown');
  perform test.login(v_admin);

  r := public.pilot_readiness();
  select x into c from jsonb_array_elements(r->'checks') x where x->>'check' = 'Nothing is past the de-identification window';
  perform test.ok((c->>'ok')::boolean = false and (c->>'blocking')::boolean, 'overdue rows turn readiness red');

  r := public.purge_stale_respondent_data();
  perform test.ok((r->>'sessions_deleted')::int = 1, 'the 62-month session is purged: ' || r::text);
  perform test.ok(((r->'deidentified_first')->>'sessions_deidentified')::int = 2, 'both were de-identified first');
  perform test.ok(not exists (select 1 from sessions s join campaigns c on c.id = s.campaign_id
                               where c.org_id = v_org and s.city is not null), 'no city survives');

  r := public.pilot_readiness();
  select x into c from jsonb_array_elements(r->'checks') x where x->>'check' = 'Nothing is past the de-identification window';
  perform test.ok((c->>'ok')::boolean, 'readiness green again once caught up');
end $$;
