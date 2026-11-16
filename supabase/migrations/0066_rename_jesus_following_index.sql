-- ============================================================================
-- The Jesus Following Index — the name in stored copy (migration 0066)
-- ============================================================================
-- Nov 2026: the public name changes from "The Jesus Index" to "The Jesus
-- Following Index", and the bare short form "the Index" is retired. The app's
-- own copy changes in code; this migration carries the same change into the
-- one place copy lives in the database: the Collab's email templates
-- (comms_templates — seeded by 0056 and 0063, editable in the console).
--
-- Deliberately narrow:
--   * Only the product name changes. A template an admin has edited keeps every
--     other word they wrote.
--   * comms_sends is NOT touched — it is the record of what was actually sent.
--   * Earlier migrations are history and are not edited; on a fresh database
--     they seed the old wording and this file renames it, exactly as in prod.
--   * "Exploration Index" (Route B) is a different index and is left alone;
--     the word boundaries below never match it.
--   * Idempotent: once renamed, neither pattern matches again.
-- ============================================================================

update public.comms_templates t
   set title   = r.title,
       subject = r.subject,
       body    = r.body,
       updated_at = now()
  from (
    select key,
           regexp_replace(replace(title,   'Jesus Index', 'Jesus Following Index'), '\m([Tt])he Index\M', '\1he Jesus Following Index', 'g') as title,
           regexp_replace(replace(subject, 'Jesus Index', 'Jesus Following Index'), '\m([Tt])he Index\M', '\1he Jesus Following Index', 'g') as subject,
           regexp_replace(replace(body,    'Jesus Index', 'Jesus Following Index'), '\m([Tt])he Index\M', '\1he Jesus Following Index', 'g') as body
      from public.comms_templates
  ) r
 where t.key = r.key
   and (t.title is distinct from r.title or t.subject is distinct from r.subject or t.body is distinct from r.body);
