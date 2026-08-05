# Project Instructions — The Index (jfindx.org)

> Paste this into the Cowork project instructions, and/or keep it as `CLAUDE.md` in the repo.
> It is the standing brief for anyone — human or agent — working on this project.

---

## 1. What we are building

A **progressive web app (PWA)** at **jfindx.org**: a multi-tenant, white-labelled, crowdsourced faith-engagement measurement platform for the **Next Gen Global Collab** (30+ ministries).

It launches as the **Next Gen Jesus-Following Index (NGJFI)** — measuring young people aged 13–30 — and is designed from day one to grow into a **complete age-range tracker** covering every life stage.

Three outcomes, in order:
1. **The shared metric** — one memorable, translatable instrument anyone can run.
2. **The dashboard** — each org sees its own results instantly, benchmarked; the Collab sees aggregate intelligence.
3. **The consulting layer** — turning a score into changed strategy.

**The pitch artifact (`Next_Gen_NGJFI_Leadership_Pitch.html`) is the guideline** for tone, visual language and the shape of every screen. **`ngjfi-platform/docs/BUILD_BRIEF.md` is the requirements source of truth.** When they conflict, the brief wins on substance, the pitch wins on presentation.

---

## 2. The core model (drives schema, scoring, every visualisation)

- **3 Questions** (*what* we measure): **Follow** (personal faith) · **Mission** (outward) · **World** (lived impact)
- **4 Tiers** (*how deep* it has gone): **Exposure → Response → Formation → Multiplication**

Every item carries one question domain and one tier → a **3 × 4 matrix**. The tier-to-tier narrowing is the **journey funnel**; the overall movement is **"gospel momentum."** Always support reporting through **both lenses**.

---

## 3. Non-negotiables

1. **Never overclaim.** Report only on *"those who have completed the Index"* — never a whole population. Benchmarks stay hidden until a geography passes the **critical-mass gate** (configurable, e.g. n ≥ 400). Show sample size wherever a score appears.
2. **Privacy is a feature, not a setting.** Respondents are **anonymous**: no names, emails, precise location or IP. Age is a **band**, never a birthdate. Consent — including parental consent for minors — is handled **at the edge** by each organisation. **Never** design anything that centrally holds identifiable data about under-18s.
3. **Never lock the instrument.** Items, scales, tags, reverse flags, translations and scoring are **versioned config**, never hard-coded. Responses bind to the instrument + scoring version they were captured under, so re-scoring is always possible.
4. **White-label means theirs.** Org-facing surfaces carry the org's brand; the Index sits in the footer.
5. **Keep the two core activities** — weekly prayer and weekly scripture engagement must always be measurable.
6. **Orgs see aggregates only.** No individual response is ever exposed to an organisation.
7. **Clay, not a vase.** This is a starting brief. Flag assumptions, propose better, expect the model to be reshaped by researchers and the Collab.

---

## 4. Build it as a PWA

The respondent experience must work **on a cheap phone, in a camp, on a bad connection**.

- Installable: web app manifest, icons, splash, **add-to-home-screen** on iOS and Android.
- **Service worker** with offline shell; the survey should load and run offline once opened.
- **Offline-tolerant submission** — queue responses locally and sync when connectivity returns. Never lose a respondent's answers to a dropped signal.
- Mobile-first, one question per screen, progress indicator, ~6 minutes end to end.
- Fast on low-end devices: small bundles, no heavy chart libraries on the respondent path.
- Accessible: WCAG AA, keyboard navigable, sufficient contrast, screen-reader labels.
- Fully translatable — every respondent-facing string, RTL supported.

---

## 5. Design for the age-range future — now

The Index starts at 13–30 but will become a **whole-life tracker**. Build so that expansion is configuration, not a rewrite:

- **Never hard-code age bands.** `13_17 / 18_22 / 23_30` are *data* in the instrument config, not constants in code or SQL. Adding `31_45`, `46_65`, `66+` or a children's band must require no schema change.
- **Introduce an audience/cohort dimension** on instrument versions (e.g. `next_gen`, `adults`, `children`) so multiple instruments can coexist, each versioned and scored independently, while rolling up into the same 3×4 model.
- **Keep naming neutral in code.** Prefer `index`, `instrument`, `cohort`, `respondent` over `nextgen`/`youth` in table, column and function names. Brand naming lives in content and UI copy, not the data model.
- **Keep scoring generic.** The engine already scores any tagged item set; don't add age-specific logic to it.
- **Domain strategy:** `jfindx.org` is the platform home. The NGJFI is the *first* index on it, not the whole of it.

When in doubt: ask "would this still work if we added a 45–65 cohort tomorrow?" If no, generalise it.

---

## 6. Current state (as of Aug 2026)

A working platform is already live — see **`NGJFI_Session_Context.md`** for the full handover.

- **Live:** `ngjfi-platform.netlify.app` — respondent survey `/[org]`, org dashboard `/[org]/dashboard`, Collab Intelligence `/intelligence`
- **Repo:** `github.com/juriekriel/ngjfi-platform` (public)
- **Stack:** Next.js (App Router) + TypeScript + Tailwind · Supabase (Postgres + RLS + Auth) · Netlify
- **Built:** multi-tenant schema + RLS, anonymous-write RPCs, tested scoring engine, versioned v0 instrument (EN/ES), magic-link auth with **ministry website-domain verification**, funnel / heat-grid / findings / world map / trends, CI with PR previews
- **Demo data:** 26 synthetic orgs, ~79k responses, all flagged `is_demo` — **delete before official testing** via `supabase/delete_demo_data.sql`

**Open:** attach `jfindx.org` (confirm registration + point DNS at Netlify, update Supabase Auth redirect URLs and `NEXT_PUBLIC_SITE_URL`), PWA layer, benchmarking service + critical-mass gate, QR distribution, org self-serve onboarding, instrument admin UI, reports.

---

## 7. How to work on this project

**Multiple people build here. Treat the repo as the single source of truth.**

- **Never push to `main`.** Branch (`feat/…`, `fix/…`, `db/…`), open a PR, review the Netlify Deploy Preview, keep CI green, squash-merge.
- **Database changes are always migrations** — a new numbered file in `supabase/migrations/`. **Never hand-edit tables in the Supabase dashboard.**
- **Instrument changes** go in `src/data/instrument.v1.json` (single source of truth), then `npm run db:seed`. v0 is archived, not deleted — responses bind to the version they were captured under. If scoring logic changes, update **both** `src/lib/scoring.ts` and the SQL `ngjfi_normalize`, and add a test.
- **The demo must never diverge from the product.** The landing page, the guided tour at `/tour` and the live product render the *same* components — `components/survey/QuestionCard` and `components/index/Figures` — and `lib/sample.ts` derives every sample figure from the instrument JSON at render time. Never write a fixture, never fork a component "just for the demo". `tests/sample.test.ts` fails the build if you do.
- **Two data spaces.** `is_demo = false` is the live space and the only thing `/intelligence` publishes; `is_demo = true` is the sandbox. The split is enforced inside the SECURITY DEFINER functions and by a trigger, not by remembering a WHERE clause. Verify with `select public.data_space_report();` before any announcement.
- **Standing up a fresh database:** `npm run db:bootstrap` regenerates `supabase/bootstrap.sql` — every migration in order, one paste into a new project's SQL editor. It deliberately excludes the demo seeds.
- **Verify before claiming done:** `npm run typecheck`, `npm test`, `npm run build`, and check the live/preview URL.
- **Secrets:** only `NEXT_PUBLIC_*` values may reach the browser. Never commit the service-role key or DB password; never paste them into chat. The app runs on the anon key + RLS alone.
- **Ask before:** changing the instrument's wording or scoring (researcher-owned), spending money (domains, paid tiers), deleting data, or anything that would centralise identifiable data.

---

## 8. Design system

**An almanac, not an app** (Brand Proof № 2, Aug 2026). As if the Index had been printed annually since long before it had a website. Density is credibility: airy hero sections say marketing, set tables say measurement.

**Do not restate these values in a component.** They live in `tailwind.config.ts` and `globals.css`, and every surface reads them from there — that is why the whole platform re-skinned from one file.

- **Paper** `#FAF7F1` · **Plate** `#FFFDF8` · **Ink** `#1B1F27` · **Ink-2** `#4C5260` · **Rules** `#D9D2C4`
- **Emerald** `#0B8A60` — the single working colour · **Navy** `#35639C` — levels · **Vermillion** `#B5451B` — semantic "down" only, never decoration
- **The rule of voices:** if it's a sentence, it's **Newsreader**. If it's a number, it's **IBM Plex Mono**, tabular. If it's a control, it's **Inter**. No exceptions — that's what makes it a system, and it's enforced by a global CSS selector, not by discipline.
- **Refused:** gradients · glassmorphism · rounded cards · shadows · scroll-triggered animation · emoji as icons · the centered hero with three feature cards. `borderRadius` and `boxShadow` collapse to nothing in the Tailwind config, so these cannot be written even by accident.
- **Kept:** hairline and double rules · numbered figures with captions · footnotes and sources · asymmetric grid with marginalia · square corners · a colophon.
- **UX:** mobile-first respondent flow; progressive disclosure; white-label cleanly overrides org-facing surfaces.

---

## 9. Definition of done

A change is done when it: passes typecheck, tests and build · is reviewed on a Deploy Preview · keeps respondents anonymous · never exposes individual responses to an org · shows sample size alongside any score · scopes every claim to *"of those who have completed the Index"* · works on a low-end phone · and would still work if a new age cohort were added tomorrow.
