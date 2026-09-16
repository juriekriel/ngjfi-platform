# Publishing to jfindx.org

There is one supported way to get a change onto jfindx.org, and it does not
require you to hold a GitHub credential.

## Why it works this way

A Cowork session only carries a push credential when the repository was attached
to that session as a **source**. Cloning a *public* repo needs no credential at
all, so a session that cloned by hand looks completely healthy — it reads, edits,
commits, runs tests — and only fails at the push, with:

```
fatal: could not read Username for 'https://github.com': No such device or address
```

That is git trying to prompt for a username in a shell with no keyboard. It is
not a permissions problem, and no amount of re-checking your repo access will
fix it. By the time you see it, the work exists only inside a container that
will be reclaimed.

So the credential lives in one place instead — a small service on the Mac Studio
— and sessions send it finished file contents.

## The flow

1. `GET /api/source?path=<file>` — read the current file and its `base` token.
2. Make your edit against that exact content.
3. `POST /api/publish` — send the **complete** new file body plus the `base`
   token. A mismatched token is refused, which is what stops a rewrite from a
   stale copy silently deleting someone else's work.
4. The service commits to a branch, opens a PR, waits for CI
   (`typecheck`, `test`, `build`), and squash-merges on green.
5. Netlify rebuilds `main`. jfindx.org updates about two minutes later.

If CI fails, nothing is merged and the site is untouched. The branch stays open
so you can read the failing step and try again.

## Database migrations

They are applied for you, and the ordering is deliberate.

A change under `supabase/migrations/` is applied to Supabase **after CI goes
green and before the merge**. A database ahead of the application is harmless —
the new columns simply sit unused. An application ahead of its database is a
broken site. So if a migration fails, nothing merges, and production stays on
the old code against the old schema, which is at least a consistent pair.

`public.schema_migrations` records what has run. A migration file that is edited
after it has been applied is refused outright: the repo and the database then
disagree about history, and guessing which is right is how you lose data.

`GET /api/migrations` shows what the database has and what `main` is still
waiting on.

## Guardrails

- `.env*`, `.git/`, `node_modules/`, `.next/` and `.netlify/` are refused.
- 40 files, 1 MB per file, 5 MB per submission.
- Sending a file body that is much shorter than the current one raises a warning
  in the PR — usually the sign of an edit built on a stale copy.
- Every submission is recorded, with who sent it and which paths it touched.

## If the publisher is unreachable

`502 upstream unavailable` means the Mac Studio hosting JFI Publish is asleep or
offline. Nothing is lost and nothing is half-done — the request never reached the
service. Wait and try again, or tell Jurie.

This is the one standing dependency: publishing needs that machine awake.
