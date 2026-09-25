-- ============================================================================
-- The Jesus Index — launch round (migration 0036)
--
-- 1. BUG: public links said "isn't collecting answers yet".
--    A survey writes to the campaign matching its audience: community →
--    slug 'default', public → slug 'open'. Organisations created by 0034's
--    admin_create_org() / self_serve_create_org() only ever got the 'default'
--    campaign, so every PUBLIC link (and /<org>/open) found no campaign and
--    refused — whatever its open/close dates said. Fixed three ways:
--      a. backfill an 'open' campaign for every organisation that lacks one;
--      b. whenever a 'default' campaign is created, create its 'open' twin;
--      c. saving a public distribution link makes sure the 'open' campaign
--         exists and is active.
--
-- 2. Organisations edit their OWN survey settings (until now only an
--    administrator could, through admin_update_org()):
--      org_update_settings()  name, logo, colour, welcome/closing messages
--      org_set_duration()     full (~7 min) or core (~3 min) item set
--      org_settings()         what the settings page reads
--    Active org_admin members only. Nothing here touches respondents.
-- ============================================================================


-- 1a. Backfill.
insert into public.campaigns (org_id, slug, audience, instrument_version_id, locale, active, item_set, scoring_version)
select c.org_id, 'open', 'public', c.instrument_version_id, c.locale, true, c.item_set, c.scoring_version
  from public.campaigns c
 where c.slug = 'default'
   and not exists (select 1 from public.campaigns o where o.org_id = c.org_id and o.slug = 'open');


-- 1b. Every new community campaign gets its public twin.
create or replace function public.ensure_open_twin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.slug = 'default' and not exists (select 1 from campaigns where org_id = new.org_id and slug = 'open') then
    insert into campaigns (org_id, slug, audience, instrument_version_id, locale, active, item_set, scoring_version)
    values (new.org_id, 'open', 'public', new.instrument_version_id, new.locale, true, new.item_set, new.scoring_version);
  end if;
  return new;
end;
$$;

drop trigger if exists campaigns_open_twin on public.campaigns;
create trigger campaigns_open_twin
  after insert on public.campaigns
  for each row execute function public.ensure_open_twin();


-- 1c. A public link always has a live public campaign behind it.
create or replace function public.ensure_campaign_for_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_default campaigns%rowtype;
begin
  if new.audience = 'public' then
    if exists (select 1 from campaigns where org_id = new.org_id and slug = 'open') then
      update campaigns set active = true where org_id = new.org_id and slug = 'open' and active = false;
    else
      select * into v_default from campaigns where org_id = new.org_id and slug = 'default' order by created_at limit 1;
      if found then
        insert into campaigns (org_id, slug, audience, instrument_version_id, locale, active, item_set, scoring_version)
        values (new.org_id, 'open', 'public', v_default.instrument_version_id, v_default.locale, true, v_default.item_set, v_default.scoring_version);
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists distribution_links_ensure_campaign on public.distribution_links;
create trigger distribution_links_ensure_campaign
  after insert or update of audience on public.distribution_links
  for each row execute function public.ensure_campaign_for_link();


-- 2. Organisation self-serve settings.
create or replace function public._require_org_admin(p_org_slug text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organisations where slug = p_org_slug;
  if v_org is null then raise exception 'org not found'; end if;
  if auth.uid() is null or not exists (
    select 1 from org_members m
     where m.org_id = v_org and m.user_id = auth.uid() and m.status = 'active' and m.role = 'org_admin'
  ) then
    raise exception 'only an organisation admin can change survey settings';
  end if;
  return v_org;
end;
$$;

revoke all on function public._require_org_admin(text) from public, anon, authenticated;


create or replace function public.org_settings(p_org_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; r organisations%rowtype;
begin
  select id into v_org from organisations where slug = p_org_slug;
  if v_org is null then raise exception 'org not found'; end if;
  if auth.uid() is null or not exists (select 1 from org_members m where m.org_id = v_org and m.user_id = auth.uid() and m.status = 'active') then
    raise exception 'not authorised for this organisation';
  end if;
  select * into r from organisations where id = v_org;
  return jsonb_build_object(
    'name', r.name, 'short_name', r.short_name, 'logo_url', r.logo_url, 'brand_color', r.brand_color,
    'welcome_message', r.welcome_message, 'closing_message', r.closing_message, 'country', r.country,
    'status', r.status,
    'can_edit', exists (select 1 from org_members m where m.org_id = v_org and m.user_id = auth.uid() and m.status = 'active' and m.role = 'org_admin'),
    'item_set', (select item_set from campaigns where org_id = v_org and slug = 'default' limit 1),
    'locales', (select coalesce(jsonb_agg(distinct locale), '[]'::jsonb) from campaigns where org_id = v_org)
  );
end;
$$;

grant execute on function public.org_settings(text) to authenticated;


create or replace function public.org_update_settings(p_org_slug text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := _require_org_admin(p_org_slug);
begin
  if p_patch ? 'brand_color' and coalesce(p_patch->>'brand_color', '') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'colour must look like #1f5f8b';
  end if;
  if p_patch ? 'logo_url' and coalesce(p_patch->>'logo_url', '') <> '' and p_patch->>'logo_url' !~ '^https://' then
    raise exception 'the logo must be an https:// image address';
  end if;
  if p_patch ? 'name' and length(btrim(coalesce(p_patch->>'name', ''))) not between 2 and 80 then
    raise exception 'the name must be 2–80 characters';
  end if;
  if (p_patch ? 'welcome_message' and length(coalesce(p_patch->>'welcome_message', '')) > 600)
     or (p_patch ? 'closing_message' and length(coalesce(p_patch->>'closing_message', '')) > 600) then
    raise exception 'messages must be 600 characters or fewer';
  end if;

  update organisations o set
    name            = coalesce(nullif(btrim(p_patch->>'name'), ''), o.name),
    brand_color     = coalesce(p_patch->>'brand_color', o.brand_color),
    logo_url        = case when p_patch ? 'logo_url' then nullif(btrim(p_patch->>'logo_url'), '') else o.logo_url end,
    welcome_message = case when p_patch ? 'welcome_message' then nullif(btrim(p_patch->>'welcome_message'), '') else o.welcome_message end,
    closing_message = case when p_patch ? 'closing_message' then nullif(btrim(p_patch->>'closing_message'), '') else o.closing_message end
  where o.id = v_org;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.org_update_settings(text, jsonb) to authenticated;


-- Duration: which item set both of the organisation's campaigns field.
-- 'full' ≈ 7 minutes; 'core' ≈ 3 minutes (the twelve core items + context).
-- Responses stay bound to the instrument version they were answered under.
create or replace function public.org_set_duration(p_org_slug text, p_item_set text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := _require_org_admin(p_org_slug);
begin
  if p_item_set not in ('full', 'core') then raise exception 'duration must be full or core'; end if;
  update campaigns set item_set = p_item_set where org_id = v_org and slug in ('default', 'open');
  return jsonb_build_object('item_set', p_item_set);
end;
$$;

grant execute on function public.org_set_duration(text, text) to authenticated;
