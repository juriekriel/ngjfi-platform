-- ============================================================================
-- The Jesus Index — reserve the /pitch short name (migration 0061, round 8)
-- ============================================================================
-- /pitch now serves the leadership pitch (public/pitch/index.html, built from
-- the live instrument by scripts/build-pitch.mjs). Reserve the name so no
-- organisation can claim it as its survey short name and collide with it.
-- No data is touched.
insert into public.reserved_short_names (name, reason) values
  ('pitch', 'site: /pitch (leadership pitch, 0061)')
on conflict (name) do nothing;
