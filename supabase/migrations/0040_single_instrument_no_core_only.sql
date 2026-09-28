-- ============================================================================
-- The Jesus Index — one instrument, no shorter versions (migration 0040)
--
-- Until now a campaign or wave could field item_set 'core': the twelve J12
-- core items plus the four "about you" questions. That option is retired —
-- every survey asks the whole instrument, and branching alone decides who sees
-- what. (It was also broken: the J12 items are gated on the screener, which
-- the core set never included, so a core respondent was asked four questions.)
--
-- The J12 `core` flag stays on the twelve items as a label for reporting; it
-- just can no longer be used to shorten a survey.
--
--   1. Every existing campaign and wave moves to 'full'.
--   2. 'full' becomes the only allowed value, and the default.
--   3. A trigger holds that line for any caller still passing 'core'
--      (campaign_upsert() and the wave RPCs default p_item_set to 'core'), so
--      an old console tab can't fail — it simply gets the full instrument.
--   4. org_set_duration() — the organisation's "Short · about 3 minutes"
--      switch — now only accepts 'full'. Its tile is gone from Survey settings.
--
-- Responses are untouched: answers already given under a core campaign keep
-- their own item_id and instrument version (non-negotiable #3).
-- ============================================================================

update public.campaigns set item_set = 'full' where item_set is distinct from 'full';
update public.waves     set item_set = 'full' where item_set is distinct from 'full';

alter table public.campaigns drop constraint if exists campaigns_item_set_check;
alter table public.waves     drop constraint if exists waves_item_set_check;
alter table public.campaigns alter column item_set set default 'full';
alter table public.waves     alter column item_set set default 'full';
alter table public.campaigns add constraint campaigns_item_set_check check (item_set = 'full');
alter table public.waves     add constraint waves_item_set_check     check (item_set = 'full');

comment on column public.campaigns.item_set is
  'Always ''full'' since migration 0040 — one instrument, no shorter versions. Kept for history.';
comment on column public.waves.item_set is
  'Always ''full'' since migration 0040 — one instrument, no shorter versions. Kept for history.';

create or replace function public.force_full_item_set()
returns trigger language plpgsql as $$
begin
  new.item_set := 'full';
  return new;
end;
$$;

drop trigger if exists trg_campaigns_full_item_set on public.campaigns;
create trigger trg_campaigns_full_item_set
  before insert or update of item_set on public.campaigns
  for each row execute function public.force_full_item_set();

drop trigger if exists trg_waves_full_item_set on public.waves;
create trigger trg_waves_full_item_set
  before insert or update of item_set on public.waves
  for each row execute function public.force_full_item_set();

create or replace function public.org_set_duration(p_org_slug text, p_item_set text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := _require_org_admin(p_org_slug);
begin
  if p_item_set is distinct from 'full' then
    raise exception 'there is one instrument and no shorter version — duration is always full';
  end if;
  update campaigns set item_set = 'full' where org_id = v_org and slug in ('default', 'open');
  return jsonb_build_object('item_set', 'full');
end;
$$;

grant execute on function public.org_set_duration(text, text) to authenticated;
