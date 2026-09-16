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

## The one thing it does not do

Netlify deploys the application. It does **not** run database migrations. A
change under `supabase/migrations/` ships the SQL file to the repo, and the SQL
still has to be applied to the Supabase project by hand. The publisher flags
this in its response rather than letting it pass unnoticed.

## Guardrails

- `.env*`, `.git/`, `node_modules/`, `.next/` and `.netlify/` are refused.
- 40 files, 1 MB per file, 5 MB per submission.
- Sending a file body that is much shorter than the current one raises a warning
  in the PR — usually the sign of an edit built on a stale copy.
- Every submission is recorded, with who sent it and which paths it touched.
