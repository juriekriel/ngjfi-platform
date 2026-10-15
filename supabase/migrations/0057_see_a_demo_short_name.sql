-- ============================================================================
-- The Jesus Index — reserve /see-a-demo (migration 0057, Oct 2026)
--
-- The public demo page moved to its own route, /see-a-demo, with the global
-- view and the three sample ministries ("See your: Ministry · Organisation ·
-- Church"). A static route shadows the [org] route, so an organisation must
-- never be able to claim the same short name — its survey link would open
-- the demo page instead. Reference data only; nothing about any respondent.
-- ============================================================================

insert into public.reserved_short_names (name, reason) values
  ('see-a-demo', 'site: /see-a-demo (public demo page)')
on conflict (name) do nothing;
