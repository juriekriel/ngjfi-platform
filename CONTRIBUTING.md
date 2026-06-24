# Contributing

A few shared conventions so multiple people can build in parallel without stepping on each other.

## Branch & PR workflow

- `main` is always deployable. **Never push directly to `main`.**
- Branch per change: `feat/…`, `fix/…`, `chore/…`, `db/…` (e.g. `feat/respondent-i18n`).
- Open a Pull Request. Netlify posts a **Deploy Preview** URL on the PR — review the live change there.
- CI (GitHub Actions) runs typecheck + tests + build on every PR; keep it green.
- Get one review, then squash-merge. Merging to `main` deploys to production.

> Recommended once the team is set: protect `main` (require PR + passing CI) in
> GitHub → Settings → Branches.

## Database changes — always as migrations

The database schema is **code**. Don't edit tables by hand in the Supabase dashboard.

1. Add a new file `supabase/migrations/000N_description.sql` (monotonic numbering).
2. Test it locally: `supabase db reset` (applies all migrations to a clean local DB).
3. If you changed the instrument, update `src/data/instrument.v0.json` and run `npm run db:seed`.
4. Apply to the shared project with `supabase db push` (or let the reviewer apply on merge).

This keeps every developer, preview, and production database identical and reviewable.

## Instrument changes

`src/data/instrument.v0.json` is the **single source of truth** for items, scales, tags,
reverse flags, and translations. Edit it there; `npm run db:seed` syncs it into the DB. Keep
the scoring metadata (`scored`, `reverse_scored`, `tier`, `question_domain`, `scale.points`)
accurate — the scoring engine and the SQL `ngjfi_normalize` both depend on it.

When you change scoring logic, update **both** `src/lib/scoring.ts` and the SQL
`ngjfi_normalize` in `supabase/migrations`, and add/adjust a case in `tests/scoring.test.ts`.

## Code style

- TypeScript strict. Prefer small, pure functions (the scoring engine is the model).
- Keep secrets out of the repo. Only `NEXT_PUBLIC_*` values may reach the browser.
- Never collect respondent PII. Sessions are anonymous by design.

## Running checks locally

```bash
npm run typecheck
npm test          # Node >= 22.6
npm run build
```
