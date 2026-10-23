-- ============================================================================
-- The Jesus Index — the waitlist emails only answer a real, fresh sign-up
-- (migration 0062, launch readiness, Oct 2026)
-- ============================================================================
-- WHY
-- /api/waitlist-notify was unauthenticated and sent its "You're in" email to
-- whatever address was POSTed to it, with whatever organisation name came with
-- it. Anyone could use the site's verified sending domain to email anyone,
-- as often as they liked — burning the Resend quota and, worse, the domain's
-- sender reputation, which the sign-in (magic-link) emails depend on.
--
-- WHAT
-- waitlist_claim_notification(p_email, p_kind) — the route asks the database
-- before it sends anything:
--   * 'join': a waitlist row for that address created in the last
--     10 minutes whose confirmation has NOT been sent yet. The row is marked
--     sent in the same statement, so a second call (or a replay) gets nothing.
--   * 'setup_call': the same address said yes / maybe to a setup call in the
--     last 10 minutes, and the team hasn't been told yet. Marked the same way.
-- It returns what the database holds (email, organisation, role …) — the route
-- writes the email from THAT, never from the request body.
--
-- Residual: someone can still sign a stranger up once (exactly as before),
-- and that stranger then gets exactly one confirmation. Never two, never a
-- stream, and never text that wasn't saved as a sign-up first.
-- Nothing about any respondent is read or written.
-- ============================================================================

alter table public.waitlist_contacts
  add column if not exists confirmation_emailed_at timestamptz,
  add column if not exists setup_call_notified_at  timestamptz;

-- Rows that existed before this migration have already had (or missed) their
-- email; never let them be claimed now.
update public.waitlist_contacts
   set confirmation_emailed_at = coalesce(confirmation_emailed_at, created_at)
 where confirmation_emailed_at is null
   and created_at < now() - interval '10 minutes';

create or replace function public.waitlist_claim_notification(p_email text, p_kind text default 'join')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email citext := lower(btrim(coalesce(p_email, '')))::citext;
  v_row   jsonb;
begin
  if p_kind = 'join' then
    update waitlist_contacts w
       set confirmation_emailed_at = now()
     where w.email = v_email
       and w.created_at > now() - interval '10 minutes'
       and w.confirmation_emailed_at is null
    returning jsonb_build_object(
      'email', w.email, 'org_name', w.org_name, 'role', w.role, 'referral_code', w.referral_code)
      into v_row;
  elsif p_kind = 'setup_call' then
    update waitlist_contacts w
       set setup_call_notified_at = now()
     where w.email = v_email
       and w.updated_at > now() - interval '10 minutes'
       and w.setup_call in ('yes', 'maybe')
       and w.setup_call_notified_at is null
    returning jsonb_build_object(
      'email', w.email, 'org_name', w.org_name, 'role', w.role, 'setup_call', w.setup_call,
      'countries', array_to_string(w.countries, ', '), 'reach', w.reach_band)
      into v_row;
  else
    raise exception 'kind must be join or setup_call';
  end if;
  return v_row;  -- null: nothing to send
end;
$$;

revoke all on function public.waitlist_claim_notification(text, text) from public;
grant execute on function public.waitlist_claim_notification(text, text) to anon, authenticated;
