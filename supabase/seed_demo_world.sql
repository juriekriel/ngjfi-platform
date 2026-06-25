-- ============================================================================
-- GLOBAL DEMO DATA (synthetic, NOT real research). For testing only — every
-- org is flagged is_demo and removable via supabase/delete_demo_data.sql.
--
-- 20 fictional-name ministries across all 11 NXT Move regions. Each has 1-3
-- annual waves (so year-over-year trends exist); earlier waves score a little
-- lower, producing realistic upward "gospel momentum". Tier levels are modelled
-- on broad, plausible regional engagement patterns — illustrative, not factual.
-- ============================================================================

with defs(slug, name, region, country, brand, e, r, f, m, n_per_wave, waves) as (values
  -- slug                name                    region                       country            brand       e   r   f   m   n   w
  ('harvest-generation', 'Harvest Generation',    'Africa',                    'Nigeria',         '#3f9d72', 94, 76, 60, 48, 110, 3),
  ('ubuntu-collective',  'Ubuntu Youth Collective','Africa',                   'South Africa',    '#2f80c4', 88, 66, 50, 36,  90, 2),
  ('great-lakes',        'Great Lakes Disciples', 'Africa',                    'Uganda',          '#e0993f', 92, 74, 58, 46,  70, 2),
  ('geracao-vida',       'Geração Vida',          'Brazil',                    'Brazil',          '#3f9d72', 90, 72, 56, 44, 120, 3),
  ('camino-joven',       'Camino Joven',          'Latin America',             'Colombia',        '#ff7a47', 89, 70, 54, 42,  90, 3),
  ('raices',             'Raíces Movement',       'Latin America',             'Peru',            '#8b5cf6', 85, 63, 47, 33,  70, 1),
  ('northside',          'Northside Collective',  'North America',             'United States',   '#2f80c4', 86, 62, 45, 30, 110, 3),
  ('true-north',         'True North Youth',      'North America',             'Canada',          '#5b6470', 82, 58, 42, 28,  80, 2),
  ('quelle-jugend',      'Quelle Jugend',         'Europe',                    'Germany',         '#5b6470', 78, 52, 38, 24,  70, 2),
  ('lumiere-jeunesse',   'Lumière Jeunesse',      'Europe',                    'France',          '#8b5cf6', 76, 50, 36, 22,  60, 1),
  ('nordic-anchor',      'Nordic Anchor',         'Europe',                    'Sweden',          '#2f80c4', 74, 48, 35, 21,  55, 1),
  ('cedar-light',        'Cedar & Light',         'Middle East & North Africa','Egypt',           '#e0993f', 60, 52, 44, 32,  45, 2),
  ('silk-road',          'Silk Road Fellowship',  'Central Asia',              'Kazakhstan',      '#5b6470', 58, 48, 40, 28,  50, 1),
  ('hanbit-youth',       'Hanbit Youth',          'East Asia',                 'South Korea',     '#ff7a47', 88, 70, 56, 44, 100, 3),
  ('tokyo-grace',        'Tokyo Grace Network',   'East Asia',                 'Japan',           '#5b6470', 70, 50, 38, 24,  70, 2),
  ('living-spring',      'Living Spring India',   'South Asia',                'India',           '#e0993f', 72, 60, 48, 36,  90, 3),
  ('himalaya-hope',      'Himalaya Hope',         'South Asia',                'Nepal',           '#8b5cf6', 70, 58, 46, 34,  60, 1),
  ('kingdom-jakarta',    'Kingdom Jakarta',       'Southeast Asia',            'Indonesia',       '#3f9d72', 80, 60, 46, 33,  90, 2),
  ('mekong-light',       'Mekong Light',          'Southeast Asia',            'Vietnam',         '#2f80c4', 68, 54, 42, 30,  70, 2),
  ('pasifika-youth',     'Pasifika Youth',        'South Pacific',             'Papua New Guinea','#ff7a47', 90, 70, 54, 42,  80, 2)
),
new_orgs as (
  insert into public.organisations
    (slug, name, brand_color, region, country, website_domain, membership_tier, verified, is_demo)
  select d.slug, d.name, d.brand, d.region, d.country, d.slug || '.org', 'collab_member', true, true
  from defs d
  on conflict (slug) do update set
    name = excluded.name, region = excluded.region, country = excluded.country, is_demo = true
  returning id, slug
),
new_camps as (
  insert into public.campaigns
    (org_id, slug, instrument_version_id, scoring_version, locale, active, source_label)
  select no.id, 'default', iv.id, 'v0.1.0', 'en', true, 'demo'
  from new_orgs no
  cross join (select id from public.instrument_versions where version = 'v0') iv
  on conflict (org_id, slug) do update set active = true
  returning id as campaign_id, org_id
),
sess as (
  insert into public.sessions (campaign_id, age_band, gender, country, locale, completed, consent, created_at)
  select nc.campaign_id,
         (array['13_17','18_22','23_30'])[1 + floor(random()*3)::int],
         (array['male','female','prefer_not'])[1 + floor(random()*3)::int],
         d.country, 'en', true, '{}'::jsonb,
         (now() - ((d.waves - w.w) * interval '1 year') - (random() * interval '300 days'))
  from new_camps nc
  join new_orgs no on no.id = nc.org_id
  join defs d on d.slug = no.slug
  cross join lateral generate_series(1, d.waves) as w(w)
  cross join lateral generate_series(1, d.n_per_wave) as p(p)
  returning id as session_id, campaign_id, created_at
)
insert into public.responses (session_id, item_id, item_key, raw_value, normalized, tier, question_domain)
select s.session_id, i.id, i.key, null,
       greatest(0, least(100,
         (case i.tier
            when 'exposure' then d.e when 'response' then d.r
            when 'formation' then d.f when 'multiplication' then d.m else 50 end)
         - ((extract(year from now()) - extract(year from s.created_at)) * 4)
         + (random()*22 - 11)
       )),
       i.tier, i.question_domain
from sess s
join new_camps nc on nc.campaign_id = s.campaign_id
join new_orgs no on no.id = nc.org_id
join defs d on d.slug = no.slug
cross join (select id from public.instrument_versions where version = 'v0') iv
join public.items i on i.instrument_version_id = iv.id and i.scored = true
on conflict (session_id, item_id) do nothing;
