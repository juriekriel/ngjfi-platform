-- 0059: a campaign moves to a version that drops NAMED UNSCORED items — and never one that drops a scored item.
do $$
declare
  v_old uuid; v_new uuid; v_bad uuid;
  v_org uuid := test.make_org('adopt-org');
  v_org2 uuid := test.make_org('adopt-org-2');
  c1 uuid; c2 uuid; r jsonb;
begin
  insert into instrument_versions (version, status, definition) values ('t_old', 'archived', '{"items": []}') returning id into v_old;
  insert into instrument_versions (version, status, definition) values ('t_new', 'active',   '{"items": []}') returning id into v_new;
  insert into items (instrument_version_id, key, question_domain, tier, type, scored) values
    (v_old, 'f_exp',  'follow',   'exposure', 'likert_5',      true),
    (v_old, 'open_q', 'screener', 'na',       'open_text',     false),
    (v_old, 'offer',  'screener', 'na',       'single_select', false),
    (v_new, 'f_exp',  'follow',   'exposure', 'likert_5',      true),
    (v_new, 'attn_b', 'screener', 'na',       'likert_5',      false);
  insert into campaigns (org_id, slug, instrument_version_id) values (v_org, 'default', v_old) returning id into c1;

  -- Without naming the drops, the 0039 rule holds: the campaign stays put.
  r := public.adopt_instrument_version('t_new');
  perform test.ok((select instrument_version_id = v_old from campaigns where id = c1), 'one-argument call keeps the 0039 superset rule: ' || r::text);

  -- Naming only one of the two dropped items is not enough.
  r := public.adopt_instrument_version('t_new', array['open_q']);
  perform test.ok((select instrument_version_id = v_old from campaigns where id = c1), 'every dropped key must be named');

  -- Naming both: the campaign moves, and the result says what was dropped.
  r := public.adopt_instrument_version('t_new', array['open_q', 'offer']);
  perform test.ok((select instrument_version_id = v_new from campaigns where id = c1), 'campaign adopts the new version: ' || r::text);
  perform test.ok(r->'dropped_unscored' = '["open_q", "offer"]'::jsonb, 'result records the drops');

  -- A version that would lose a SCORED item never moves, even if it is named.
  insert into instrument_versions (version, status, definition) values ('t_bad', 'archived', '{"items": []}') returning id into v_bad;
  insert into items (instrument_version_id, key, question_domain, tier, type, scored) values
    (v_bad, 'f_exp', 'follow', 'exposure', 'likert_5', true),
    (v_bad, 'f_res', 'follow', 'response', 'likert_5', true);
  insert into campaigns (org_id, slug, instrument_version_id) values (v_org2, 'default', v_bad) returning id into c2;
  r := public.adopt_instrument_version('t_new', array['f_res']);
  perform test.ok((select instrument_version_id = v_bad from campaigns where id = c2), 'a scored item can never be dropped');

  -- Naming a key the target still asks is a mistake, and says so.
  perform test.raises($q$select public.adopt_instrument_version('t_new', array['f_exp'])$q$, '%still asks%');

  -- Not callable from the browser.
  perform test.ok(not has_function_privilege('anon', 'public.adopt_instrument_version(text, text[])', 'execute'), 'anon cannot call it');
  perform test.ok(not has_function_privilege('authenticated', 'public.adopt_instrument_version(text, text[])', 'execute'), 'authenticated cannot call it');
end $$;
