-- 0054: dashboard panels (admin chooses, members read) and each survey's own messages.
do $$
declare
  v_oa     uuid := test.make_user('lead@panels.test', 'org');
  v_member uuid := test.make_user('helper@panels.test', 'org');
  v_out    uuid := test.make_user('stranger@elsewhere.test', 'org');
  v_org    uuid := test.make_org('panels', false);
  v_room   uuid;
  r jsonb;
begin
  insert into org_members (org_id, user_id, role, status) values
    (v_org, v_oa, 'org_admin', 'active'), (v_org, v_member, 'coordinator', 'active');
  insert into distribution_links (org_id, name, slug) values (v_org, 'Camp night', 'camp') returning id into v_room;

  -- panels: empty by default (= everything shown)
  perform test.login(v_member);
  r := public.org_dashboard_panels('panels');
  perform test.ok(r->'panels' = '{}'::jsonb and not (r->>'can_edit')::boolean, 'members read; nothing switched off yet: ' || r::text);
  perform test.raises($q$select public.org_set_dashboard_panels('panels', '{"heatmap": false}')$q$, '%only an organisation admin%');

  perform test.login(v_out);
  perform test.raises($q$select public.org_dashboard_panels('panels')$q$, '%not authorised%');

  perform test.login(v_oa);
  perform public.org_set_dashboard_panels('panels', '{"heatmap": false, "share": false}');
  r := public.org_dashboard_panels('panels');
  perform test.ok((r->'panels'->>'heatmap')::boolean = false and (r->>'can_edit')::boolean, 'admin saves and can edit: ' || r::text);
  perform test.raises($q$select public.org_set_dashboard_panels('panels', '{"heatmap": "no"}')$q$, '%not an on/off choice%');
  perform test.raises($q$select public.org_set_dashboard_panels('panels', '[1]')$q$, '%object%');

  -- survey messages: any active member, 600 characters, empty = standard
  perform test.login(v_member);
  perform public.set_distribution_link_messages('panels', v_room, '  Welcome, camp!  ', '');
  r := public.resolve_distribution_link('panels', 'camp');
  perform test.ok(r->>'welcome_message' = 'Welcome, camp!' and r->'closing_message' = 'null'::jsonb, 'trimmed; empty is null: ' || r::text);
  perform test.raises(format($q$select public.set_distribution_link_messages('panels', %L, %L, null)$q$, v_room, repeat('x', 601)), '%600 characters%');

  perform test.login(v_out);
  perform test.raises(format($q$select public.set_distribution_link_messages('panels', %L, 'hi', 'bye')$q$, v_room), '%not authorised%');

  -- anonymous respondents see the messages through resolve, and nothing else new
  perform test.login(null);
  r := public.resolve_distribution_link('panels', 'camp');
  perform test.ok(r ? 'welcome_message' and r ? 'closing_message' and not (r ? 'dashboard_panels'), 'resolve carries the survey messages only');

  -- the dashboard list carries them too
  perform test.login(v_oa);
  r := public.org_distribution_links('panels');
  perform test.ok(r->0->>'welcome_message' = 'Welcome, camp!', 'org_distribution_links carries the messages');
end $$;
