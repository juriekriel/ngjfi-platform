# NGJFI Platform — *the Index*

The **Next Gen Jesus-Following Index**: a multi-tenant, white-labelled, crowdsourced
faith-engagement measurement platform for the NextGen Global Collab. One shared survey
instrument, a per-organisation dashboard, and an aggregate "Collab Intelligence" layer —
privacy-first, translation-ready, and careful never to overclaim.

> **Integrity line:** the platform only ever reports on *those who have completed the Index* —
> never a whole population. Benchmarks are gated by a critical-mass threshold.

---

## Stack

| Layer | Choice |
|------|--------|
| Frontend / SSR | Next.js (App Router) + TypeScript + Tailwind |
| Database / Auth | Supabase (Postgres + RLS + Auth) |
| Hosting / CI-CD | Netlify (deploy preview per pull request) |
| Source of truth | This GitHub repo — **everything is code**, including the DB schema |

The respondent survey is **anonymous** (no login, no PII). **Org admins / facilitators
authenticate**, and a ministry is verified by confirming an email at its own **website domain**.

---

## Quickstart (local)

```bash
git clone https://github.com/<owner>/ngjfi-platform.git
cd ngjfi-platform
npm install
cp .env.example .env.local      # then fill in your Supabase values
npm run db:seed                 # seed instrument + demo "Sunrise" org (needs service-role key)
npm run dev                     # http://localhost:3000
```

- Respondent survey: **`/sunrise`** (path-based white-labelling: `/{org-slug}`)
- Org dashboard: **`/sunrise/dashboard`** (sign-in required)

> Tests use Node's native type stripping — **Node ≥ 22.6** is required for `npm test`.

---

## Environment variables

See `.env.example`. Set these locally in `.env.local` (git-ignored) and in Netlify
(Site settings → Environment variables):

| Var | Where | Secret? |
|-----|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | no (publishable, RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | server / seeding only | **yes — never commit, never expose to the browser** |
| `NEXT_PUBLIC_SITE_URL` | browser | no |

---

## Supabase setup (one-time)

1. Create a project at [supabase.com](https://supabase.com) (pick a region near your users/team).
2. Copy the API URL + anon key + service-role key into `.env.local` and Netlify.
3. Apply the schema (migrations live in `supabase/migrations`):
   ```bash
   npm i -g supabase
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
4. Seed the instrument + demo org:
   ```bash
   npm run db:seed
   ```
5. In Auth settings, add your local + deploy + custom-domain URLs to the redirect allow-list.

> Schema changes are **always** made as new files in `supabase/migrations` and reviewed in a
> PR — never by hand-editing tables in the dashboard. This keeps every environment in sync.

---

## Netlify setup (one-time)

1. **Add new site → Import from Git →** pick this repo.
2. Build command `npm run build`, publish `.next` (already in `netlify.toml`; the Next.js
   runtime plugin is configured).
3. Add the environment variables above.
4. Done: every PR now gets its own **Deploy Preview** URL, and merges to `main` publish to production.

The custom domain isn't needed to build — point it at Netlify whenever it's confirmed.

---

## The measurement model

Two axes, one grid (drives the schema, scoring, and every view):

- **3 Questions** — *Follow* (personal faith), *Mission* (outward), *World* (lived impact).
- **4 Tiers** — *Exposure → Response → Formation → Multiplication* (the discipleship journey).

Every item is tagged with one question domain and one tier. Scoring (see `src/lib/scoring.ts`)
normalises each scored item to 0–100, inverts reverse-scored items, and rolls up to tier,
domain, 3×4 matrix, and an overall Index. The instrument is **versioned config**
(`src/data/instrument.v0.json`) — never hard-coded — and is illustrative v0, pending researcher revision.

---

## Project structure

```
src/
  app/
    page.tsx                 landing
    [org]/page.tsx           white-labelled respondent survey  (/sunrise)
    [org]/dashboard/page.tsx org dashboard (auth + domain verify)
  lib/
    scoring.ts               pure scoring engine (spec §5)
    instrument.ts            instrument loader + i18n helpers
    supabaseClient.ts        browser client
  data/instrument.v0.json    canonical instrument (single source of truth)
supabase/
  migrations/0001_schema.sql schema + RLS
  migrations/0002_rpcs.sql   normalisation, anon-write RPCs, domain verify, dashboard
scripts/sync-instrument.mjs  seeds DB from the instrument JSON
tests/scoring.test.ts        runnable scoring tests
```

## Scripts

| Command | Does |
|--------|------|
| `npm run dev` | local dev server |
| `npm run build` | production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | scoring engine tests (Node ≥ 22.6) |
| `npm run db:seed` | seed instrument + demo org from JSON |

---

## Status

Initial scaffold: schema + RLS + RPCs, scoring engine (tested), v0 instrument, the `/sunrise`
survey wired to Supabase, and a first org dashboard. See `docs/` for the full build brief, and
[CONTRIBUTING.md](./CONTRIBUTING.md) for the team workflow.
