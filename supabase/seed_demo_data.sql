-- ============================================================================
-- DEMO DATA for testing dashboards (NOT production). Safe to run once.
-- Adds several orgs across regions + a gmail-domain "demo" org you can claim,
-- then generates anonymous sessions with tier-realistic responses so the
-- funnel, heat-grid, regions table and org dashboards are meaningful.
-- ============================================================================

insert into public.organisations (slug, name, brand_color, region, country, website_domain, membership_tier, verified) values
  ('grace-cdmx',       'Grace Movement',     '#2f80c4', 'Latin America',  'Mexico',         'gracemovement.org', 'collab_member', true),
  ('lighthouse-mnl',   'Lighthouse Manila',  '#3f9d72', 'Southeast Asia', 'Philippines',    'lighthousemnl.org', 'collab_member', true),
  ('anchor-nairobi',   'Anchor Youth',       '#8b5cf6', 'Africa',         'Kenya',          'anchoryouth.org',   'collab_member', true),
  ('cityreach-london', 'CityReach',          '#e0993f', 'Europe',         'United Kingdom', 'cityreach.uk',      'external',      true),
  ('demo',             'Demo Ministry',      '#ff7a47', 'North America',  'United States',  'gmail.com',         'external',      false)
on conflict (slug) do nothing;

insert into public.campaigns (org_id, slug, instrument_version_id, scoring_version, locale, active, source_label)
select o.id, 'default', iv.id, 'v0.1.0', 'en', true, 'demo'
from public.organisations o, public.instrument_versions iv
where iv.version = 'v0'
  and o.slug in ('grace-cdmx','lighthouse-mnl','anchor-nairobi','cityreach-london','demo')
on conflict (org_id, slug) do nothing;

-- Generate sessions + tier-realistic responses for the demo orgs + Sunrise.
with target_campaigns as (
  select c.id as campaign_id, o.region, o.country
  from public.campaigns c
  join public.organisations o on o.id = c.org_id
  where o.slug in ('sunrise','grace-cdmx','lighthouse-mnl','anchor-nairobi','cityreach-london','demo')
),
new_sessions as (
  insert into public.sessions (campaign_id, age_band, gender, country, locale, completed, consent)
  select tc.campaign_id,
         (array['13_17','18_22','23_30'])[1 + floor(random()*3)::int],
         (array['male','female','prefer_not'])[1 + floor(random()*3)::int],
         tc.country, 'en', true, '{}'::jsonb
  from target_campaigns tc, generate_series(1, 110)
  returning id as session_id, campaign_id
)
insert into public.responses (session_id, item_id, item_key, raw_value, normalized, tier, question_domain)
select ns.session_id, i.id, i.key, null,
       greatest(0, least(100,
         (case i.tier
            when 'exposure' then 86 when 'response' then 63
            when 'formation' then 46 when 'multiplication' then 31 else 50 end)
         + (case o.region
            when 'Africa' then 8 when 'Latin America' then 5
            when 'Southeast Asia' then 4 when 'Europe' then -10 else 0 end)
         + (random()*28 - 14)
       )),
       i.tier, i.question_domain
from new_sessions ns
join public.campaigns c     on c.id = ns.campaign_id
join public.organisations o on o.id = c.org_id
join public.items i         on i.instrument_version_id = c.instrument_version_id and i.scored = true
on conflict (session_id, item_id) do nothing;
