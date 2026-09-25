-- ============================================================================
-- The Jesus Index — organisation logo uploads (migration 0037)
--
-- Survey settings (0036) let an organisation set its logo as a web address.
-- This adds direct upload: a public Supabase Storage bucket, `org-logos`,
-- where each organisation's logo lives under a folder named by its id —
--   org-logos/<organisation id>/logo-<timestamp>.png
-- — and only that organisation's ACTIVE ADMINS can add, replace or remove
-- files in its folder. Anyone can read (a logo is shown to every respondent),
-- which is why the bucket is public and holds nothing else.
--
-- Limits, enforced by Storage itself: 1 MB per file; PNG, JPEG or WebP only.
-- SVG is deliberately excluded (an SVG can carry script). The settings page
-- also shrinks images to at most 512 px before uploading, so a logo stays
-- light on a cheap phone.
--
-- A logo is an organisation's public branding — no respondent data is ever
-- stored here.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- True when the signed-in person is an active admin of the organisation
-- whose id is the first folder of this object path.
create or replace function public.can_manage_org_logo(p_name text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if auth.uid() is null or v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (
    select 1 from org_members m
     where m.org_id = v_folder::uuid and m.user_id = auth.uid()
       and m.status = 'active' and m.role = 'org_admin'
  );
end;
$$;

grant execute on function public.can_manage_org_logo(text) to authenticated;


-- Reading: logos are public (every respondent sees one), and Postgres needs
-- read access to a row before it can be replaced or removed — without this,
-- an admin's replace or remove silently affects nothing.
drop policy if exists "org-logos: anyone reads" on storage.objects;
create policy "org-logos: anyone reads" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'org-logos');

drop policy if exists "org-logos: admins add" on storage.objects;
create policy "org-logos: admins add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'org-logos' and public.can_manage_org_logo(name));

drop policy if exists "org-logos: admins replace" on storage.objects;
create policy "org-logos: admins replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'org-logos' and public.can_manage_org_logo(name))
  with check (bucket_id = 'org-logos' and public.can_manage_org_logo(name));

drop policy if exists "org-logos: admins remove" on storage.objects;
create policy "org-logos: admins remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'org-logos' and public.can_manage_org_logo(name));


-- The settings page needs the organisation's id to know its folder.
-- Same function as 0036, plus 'id'.
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
    'id', r.id,
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
