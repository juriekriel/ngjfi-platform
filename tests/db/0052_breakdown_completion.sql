-- 0052: breakdowns never expose a small group; completion counts honestly.
do $$
declare
  v_admin uuid := test.make_user('admin@test.local', 'admin');
  v_member uuid := test.make_user('member@test.local', 'org');
  v_org uuid := test.make_org('bd-org', true);
  r jsonb; g jsonb; i int; s uuid;
begin
  perform test.unlock();
  insert into org_members (org_id, user_id, role, status) values (v_org, v_member, 'org_admin', 'active');

  -- 30 × 18_22 (follow), 12 × 23_30, 3 × 13_17  → 13_17 hidden, and 23_30 hidden with it
  for i in 1..30 loop perform test.make_session(v_org, interval '1 day', null, null, null, 60, '18_22', 'female'); end loop;
  for i in 1..12 loop perform test.make_session(v_org, interval '1 day', null, null, null, 40, '23_30', 'male'); end loop;
  for i in 1..3  loop perform test.make_session(v_org, interval '1 day', null, null, null, 90, '13_17', 'male'); end loop;

  perform test.login(v_member);
  r := public.org_breakdown('bd-org', 'age_band');
  perform test.ok((r->>'total')::int = 45, 'total completions: ' || (r->>'total'));

  select x into g from jsonb_array_elements(r->'groups') x where x->>'value' = '18_22';
  perform test.ok((g->>'n')::int = 30 and (g->>'index') is not null and not (g->>'suppressed')::boolean, '18_22 shown with n and score');

  select x into g from jsonb_array_elements(r->'groups') x where x->>'value' = '13_17';
  perform test.ok((g->>'suppressed')::boolean and g->'n' = 'null'::jsonb and g->'index' = 'null'::jsonb, 'a group of 3 shows no n and no score');

  select x into g from jsonb_array_elements(r->'groups') x where x->>'value' = '23_30';
  perform test.ok((g->>'suppressed')::boolean, 'complementary suppression hides the next smallest group (12)');

  -- a second dimension works; unknown dimensions are refused
  r := public.org_breakdown('bd-org', 'gender');
  select x into g from jsonb_array_elements(r->'groups') x where x->>'value' = 'male';
  perform test.ok((g->>'n')::int = 15, 'male = 15');
  perform test.raises($q$select public.org_breakdown('bd-org', 'city')$q$, '%unknown breakdown dimension%');

  -- country groups need the place gate (400) to be named
  r := public.org_breakdown('bd-org', 'country');
  perform test.ok(not exists (select 1 from jsonb_array_elements(r->'groups') x where not (x->>'suppressed')::boolean),
                  'no country is named below 400');

  -- strangers are refused
  perform test.ok(test.via_api(test.make_user('stranger@test.local', 'org'), $q$select public.org_breakdown('bd-org', 'age_band')$q$)
                  like '%not authorised%', 'non-members are refused');

  -- completion: 45 completed; 5 abandoned 3 days ago at the index; 2 abandoned 1 hour ago (pending)
  for i in 1..5 loop
    s := test.make_session(v_org, interval '3 days');
    update sessions set completed = false where id = s;
    delete from responses where session_id = s and item_key in ('f_for', 'f_mul');
  end loop;
  for i in 1..2 loop
    s := test.make_session(v_org, interval '1 hour');
    update sessions set completed = false where id = s;
  end loop;

  perform test.login(v_member);
  r := public.org_completion('bd-org');
  perform test.ok((r->>'started')::int = 52, 'started 52: ' || r::text);
  perform test.ok((r->>'completed')::int = 45, 'completed 45');
  perform test.ok((r->>'pending')::int = 2, 'two still pending');
  perform test.ok((r->>'completion_rate')::numeric = round(45::numeric / 50, 3), 'rate excludes pending sessions');
  perform test.ok((r->'stop_points'->>'index')::int = 5, 'the five stopped at the main questions: ' || (r->'stop_points')::text);
  perform test.ok(r->'attention_check' = 'null'::jsonb, 'organisations never see the attention-check line');

  -- collab view adds the attention check, and only for the Collab
  perform test.login(v_admin);
  r := public.collab_completion();
  perform test.ok(jsonb_array_length(r) >= 1, 'collab sees organisations');
  perform test.ok(test.via_api(v_member, 'select public.collab_completion()') like '%only the Collab%', 'org users cannot');
end $$;
