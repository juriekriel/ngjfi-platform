-- ============================================================================
-- my_context() — add `slug` to each org entry (migration 0031)
--
-- my_context() (0014) already returns each org the signed-in user belongs to
-- as { short_name, name, is_demo } — enough for the internal /build console,
-- which routes by short_name. The new public "Your Organization" tab
-- (src/app/organization/page.tsx) needs to send a signed-in org member
-- straight to their own dashboard at /[slug]/dashboard, and org_dashboard()
-- takes the URL slug, not the short_name (organisations.slug vs
-- organisations.short_name are two separate columns — see 0001 and 0010).
-- Rather than add a second round trip, this re-declares my_context() with one
-- additional key per org. Everything else about the function — its signature,
-- its grants, the rest of its shape — is unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.my_context()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('signed_in', false); end if;

  return jsonb_build_object(
    'signed_in', true,
    'email',     (select email from app_users where id = v_uid),
    'role',      my_role(),
    'orgs',      coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', o.slug, 'short_name', o.short_name, 'name', o.name, 'is_demo', o.is_demo)
             order by o.name)
        from org_members m join organisations o on o.id = m.org_id
       where m.user_id = v_uid and m.status = 'active'), '[]'::jsonb),
    'networks',  coalesce((
      select jsonb_agg(jsonb_build_object(
               'short_name', n.short_name, 'name', n.name, 'kind', n.kind)
             order by n.name)
        from network_members_users u join networks n on n.id = u.network_id
       where u.user_id = v_uid and u.status = 'active'), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.my_context() to anon, authenticated;
