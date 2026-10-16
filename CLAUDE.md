# Project Instructions — The Jesus Index (jfindx.org)

> Last updated 16 Oct 2026 (instrument v6 locked; round 8 brand). The same text sits in the
> Claude project instructions. It is the standing brief for anyone, human or agent, working on
> this project. Sections 1–10 are the brief; the appendix holds repo operating notes.

## What changed from the previous instructions

These instructions replace the August 2026 version. They describe the platform as it stands with **instrument v6, locked on 16 October 2026**, and the round 8 brand.

| Area | Before | Now |
| --- | --- | --- |
| Name | Next Gen Jesus-Following Index (NGJFI) | **The Jesus Index**, "a global measure of Jesus-following"; jfindx.org stays the address |
| Goal line | "every young person with an opportunity" | "To see every young person have a real opportunity to follow Jesus by 2033." |
| Instrument | v0, 21 items, "the draft" not yet adopted | v6, locked: 48 scored items across two routes, 73 fieldable questions |
| Prayer and scripture (#5) | Not met; flagged to researchers | Met: unscored frequency items; "Weekly" or "Most days" counts |
| City-level gate (#1) | Required for free-text city | v6 asks no city; the gate stays in config for any future version that does |
| Survey length | About 6 minutes | About 8 minutes full; about 5 for the J12 only |
| Non-followers | "No second track exists yet" | Route B, scored as a separate Exploration Index, never blended |
| Pitch | Hand-typed survey, drifted from the instrument | `/pitch`, generated from the live instrument by `scripts/build-pitch.mjs` |
| Source of truth for the pitch | The pitch wins on presentation | Unchanged, but the survey content on any surface comes only from the live instrument file |

## 1. What we are building

A **progressive web app** at **jfindx.org**: a multi-tenant, white-labelled, crowdsourced faith-engagement measurement platform for the **Next Gen Global Collab** (30+ ministries). Its public name is **The Jesus Index**, with the tagline **"a global measure of Jesus-following"**. It serves the Collab's goal: *to see every young person have a real opportunity to follow Jesus by 2033.*

It launches measuring young people aged 13–30 and is designed from day one to grow into a tracker for every life stage.

Three outcomes, in order:

1. **The shared metric**: one memorable, translatable instrument anyone can run.
2. **The dashboard**: each organisation sees its own results instantly, benchmarked; the Collab sees aggregate intelligence.
3. **The consulting layer**: turning a score into changed strategy.

**Sources of truth.** `src/data/instrument.v6.json` is the only source for what a respondent is asked, on every surface: the survey, `/survey`, the pitch at `/pitch`, the share PDFs and the admin console. `docs/BUILD_BRIEF.md` is the requirements source. The pitch sets tone and visual language; when the brief and the pitch conflict, the brief wins on substance and the pitch on presentation.

## 2. The core model

Every scored item carries one question domain and one tier, making a **3 × 4 grid of twelve cells: the J12**. Always report through both lenses, by question and by tier.

| Question ↓ / Tier → | Exposure | Response | Formation | Multiplication |
| --- | --- | --- | --- | --- |
| **Follow** (personal faith) | heard of Jesus | believes | being shaped | helps others believe |
| **Mission** (outward) | aware of the call | convinced it's theirs | practising witness | mobilising others |
| **World** (lived impact) | sees faith should matter | believes it does | choices reshaped | changing their spheres |

- **Two items per cell.** Each cell has one **Internal** (belief) item and one **External** (action) item, tagged with `measure`. The J12 core is the External item from every cell.
- **Two routes, two indexes.** Route A (following Jesus) feeds **the Index**. Route B (not currently following) answers its own 24 items on the same grid and feeds the **Exploration Index**. The two are never summed, averaged or shown as one number.
- The tier-to-tier narrowing is the **journey funnel**; the overall movement is **"gospel momentum."** Scores are reported on a 1–5 scale (raw Likert means); storage stays 0–100 and only each RPC's output converts (migration 0029).

## 3. Non-negotiables

1. **Never overclaim.** Report only on "those who have completed the Index", never a whole population. Show the sample size wherever a score appears. Benchmarks stay hidden below a critical-mass gate, checked independently at each geography level. Working values today: no score under 10 people, no city or area under 400, no country under 2,000. All three are versioned platform config, not code. v6 collects no city; the city gate stays in place for any future version that does. The reporting gates are still pending Dr. Matthew Niermann's confirmation against the MoU (decision 9).
2. **Privacy is a feature, not a setting.** Respondents are anonymous: no names, emails, precise location or IP stored with answers. Age is a band, never a birthdate; an under-13 is stopped at the first question and nothing is kept. Consent, including parental consent for every 13–17-year-old, is handled by each organisation, per organisation and per survey. Never design anything that centrally holds identifiable data about under-18s. The screener's faith-status answer gets the same anonymity as every Index answer.
3. **Never lock the model in code.** Items, scales, tags, translations, scoring, routing and section type are versioned config. Responses bind to the instrument and scoring version they were captured under, so re-scoring is always possible. A **locked version is never edited**: any change to what is asked or how it is scored is a new version (next: v7). Old version files stay in the repo as the record and are never shown on a public surface.
4. **White-label means theirs.** Organisation-facing surfaces carry the organisation's brand; the Jesus Index sits in the footer.
5. **Weekly prayer and scripture are always measurable.** Met in v6 by the unscored frequency items `pray_frequency` and `scripture_frequency` (Route A, full survey). "Weekly" or "Most days" counts. They are reported as their own figure, not folded into the Index (decision 5).
6. **Organisations see aggregates only.** No individual response is ever exposed to an organisation. This covers Drivers and Journey answers: report them only as grouped option shares, behind the same critical-mass gate as scores.
7. **Clay, not a vase.** The model will keep being shaped by researchers and the Collab. Flag assumptions and propose better; within a locked version, propose for the next one.
8. **Routing is config, not code.** Which screener answers go to Route A or Route B is a versioned `show_if` rule on the items, never an `if` in code. Future cohorts get their own rules.
9. **Insight layers never silently become score.** Drivers, Journey and the prayer and scripture frequencies are never blended into a dimension, tier or cell score without an explicit, versioned scoring decision.
10. **Every route gets the same privacy bar.** Route B respondents receive exactly the same anonymity, consent and no-identifiable-data guarantees as Route A.

## 4. The instrument: v6, locked

v6 is the pilot instrument agreed by the Collab on 14 October 2026 and **locked on 16 October 2026**. v5 stays locked as the record of what was fielded before it. Both locks are enforced by `tests/instrumentLock.test.ts` (fingerprints in `src/data/instrument.locks.json`) and, in the database, by migration 0045.

| Part | Who sees it | Items | Scored |
| --- | --- | --- | --- |
| Age band, orientation, follower check | Everyone | 3 | No (routing) |
| Route A: the Index | Following Jesus | 24 + attention check | Yes |
| Prayer and scripture frequency | Route A, full survey | 2 | No |
| Route B: the Exploration Index | Not currently following | 24 + attention check | Yes, separately |
| Drivers and Journey | Everyone, for their route | 8 per route | No |
| Gender (optional), country (pick-list) | Everyone | 2 | No |

- **Routing.** Route A: orientation "New follower of Jesus" or "Committed, actively growing", or "Yes" to the follower check. Route B: everything else. The follower check appears only after "None of these" or "Prefer not to say". It has no Skip; "Not sure" and "Prefer not to say" go to Route B without recording the person as a non-follower (decision 7, closed).
- **Survey versions.** Full survey: about 8 minutes, 39 screens on the reference follower path. J12 only: about 5 minutes; screener, scored items and demographics, no Drivers, Journey or frequencies.
- **Dropped in v6, kept in v0–v5:** the open "Who is Jesus?" question, the extras opt-out screen, and city. The Belong–Trust module is archived inside v6 and can't be fielded from it.
- **Intentional anchors.** Two Route A and Route B items share identical wording on purpose, to compare the routes. They are still scored separately.
- **Still open, platform config rather than instrument:** reporting gates (decision 9), retention (decision 10), Spanish going live (decision 11; it previews but never records).
- **Changing the instrument** means writing `instrument.v7.json`, never editing v6. Wording and scoring are researcher-owned: ask first.

## 5. Build it as a PWA

The respondent experience must work on a cheap phone, in a camp, on a bad connection.

- Installable: web app manifest ("The Jesus Index"), icons, splash, add to home screen on iOS and Android.
- Service worker with an offline shell; the survey loads and runs offline once opened.
- Offline-tolerant submission: answers queue on the phone and sync when signal returns. Never lose a respondent's answers to a dropped signal.
- Mobile-first, one question per screen, a progress indicator, and the welcome screen's promised length taken from the instrument (`welcome_minutes`), never typed into copy.
- Fast on low-end devices: small bundles, no heavy chart libraries on the respondent path.
- Accessible: WCAG AA, keyboard navigable, sufficient contrast, screen-reader labels.
- Fully translatable, every respondent-facing string, RTL supported. A language records answers only once a researcher marks it live (`docs/TRANSLATION.md`).

## 6. Design for the age-range future, now

Expansion beyond 13–30 must be configuration, not a rewrite.

- **Never hard-code age bands.** `13_17 / 18_22 / 23_30` (and the under-13 close) are data in the instrument. Adding `31_45`, `46_65`, `66+` or a children's band needs no schema change.
- **A cohort dimension on instrument versions** (`next_gen`, `adults`, `children`) lets several instruments coexist, each versioned, locked and scored independently, all rolling up into the same 3 × 4 model.
- **Neutral names in code:** `index`, `instrument`, `cohort`, `respondent`, `route`. Brand names live in content and UI copy, never in tables, columns or functions.
- **Generic scoring:** the engine scores any tagged item set; no age-specific or route-specific logic beyond what the instrument's tags declare.
- **Domain:** jfindx.org is the platform home; the Jesus Index for 13–30s is the first index on it, not the whole of it.

When in doubt, ask: would this still work if we added a 45–65 cohort tomorrow?

## 7. Current state (October 2026)

The platform is live at **jfindx.org** with v6 as the live instrument. Collection is still locked (migration 0048): real links run end to end but nothing is stored or pooled until pilot readiness is signed off. Repo: `github.com/juriekriel/ngjfi-platform`. Stack: Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres + RLS + Auth), Netlify.

| Route | What it is |
| --- | --- |
| `/` | Front page: logo with tagline, goal banner, J12, try the survey, pitch PDFs |
| `/learn`, `/tour`, `/see-a-demo` | What the Index is; dashboard walkthrough; demo ministries with invented figures |
| `/join`, `/access` | Join; sign in by magic link with ministry-domain verification |
| `/survey` | The entire survey, read-only, generated from the instrument |
| `/pitch` | Leadership pitch, Survey tab generated from the instrument |
| `/[org]`, `/[org]/dashboard` | White-labelled respondent survey; organisation dashboard (aggregates only) |
| `/intelligence` | Collab Intelligence |
| `/build`, `/build/instrument` | Console and instrument admin (signed in, not public) |
| `/our-story`, `/privacy`, `/terms`, `/resources/consent` | Footer pages, incl. a consent reference for 200 countries (for counsel review) |

Built: multi-tenant schema and RLS, anonymous-write RPCs, tested scoring engine for both indexes, versioned and locked instruments, survey versions (Full / J12), offline survey, consent per organisation and per survey, view-only share links, admin controls for the critical-mass gates, exports.

**Open:**

- [ ] Apply migration 0061 and run `npm run db:seed` so the database holds v6's lock (needs a valid Supabase access token)
- [ ] Replace or redirect the standalone pitch site `ngjfi-pitch-6-1.netlify.app` to jfindx.org/pitch
- [ ] Decisions 9, 10, 11: reporting gates, retention, Spanish going live
- [ ] Pilot timing with three 13–17-year-olds to replace the 8-minute estimate (`docs/PILOT_LAUNCH_CHECKLIST.md`)
- [ ] Translate the shorter brand name into the 22 locales' "Powered by" line (translation review)
- [ ] Delete any remaining demo data before official testing (`supabase/delete_demo_data.sql`)

## 8. How to work on this project

Several people build here. The repo is the single source of truth.

- **Never push to `main`.** Branch (`feat/…`, `fix/…`, `db/…`), open a PR, review the Netlify Deploy Preview, keep CI green, squash-merge.
- **Database changes are always migrations**: a new numbered file in `supabase/migrations/` (next: 0062). Never hand-edit tables in the Supabase dashboard.
- **Instrument changes are a new version file**, `src/data/instrument.v7.json`, never an edit to v6. Then point `src/lib/instrument.ts` and the seed default at it, run `npm run db:seed`, and lock it when the Collab confirms. If scoring changes, update both `src/lib/scoring.ts` and the SQL functions, and add a test.
- **Anything that shows the survey is generated from the live instrument.** After an instrument change, run `npm run pitch:build` and `python3 scripts/build-share-docs.py`; `tests/pitch.test.ts` fails if the pitch is stale or shows a retired question.
- **Verify before claiming done:** `npm run typecheck`, `npm test`, `npm run build`, then check the Deploy Preview.
- **Secrets:** only `NEXT_PUBLIC_*` values may reach the browser. Never commit the service-role key, database password or access tokens; never paste them into chat.
- **Ask before:** changing instrument wording or scoring (researcher-owned), spending money, deleting data, locking a version in the database (permanent), or anything that would centralise identifiable data.

## 9. Design system and brand

Clean research-dashboard aesthetic. Every colour lives once, in `:root` in `src/app/globals.css` (`docs/PALETTE.md`); never restate a hex in a component.

- **Name and lockup:** "The *Jesus* Index" in the serif wordmark (Newsreader, italic *Jesus*), with **"a global measure of Jesus-following"** underneath, beside the rising mark (`public/icon-mark.svg`). Use `LOGO_TAGLINE` and `GOAL_LINE` from `src/components/site/Chrome.tsx`; never retype them.
- **Goal line:** "To see every young person have a real opportunity to follow Jesus by 2033."
- **Colours:** ink `#22252B` · page `#F5F6F8` · cards `#FFFFFF` · rules `#E2E5EA` · coral `#FF7A47` (the single working colour; the code token is still named `emerald`) · green `#3F9D72` ("up" only) · blue `#2F80C4` (levels and benchmarks only) · violet `#8B5CF6` (a domain accent) · red `#C8283B` ("down" only). Coral → violet appears in the mark and the masthead buttons.
- **Map levels:** strong ≥ 58 · emerging 42–57 · early < 42 · grey for no data.
- **Type:** Inter Tight for every control and body text; tracked uppercase only for data captions; Newsreader only for the wordmark lockup; JetBrains Mono for tabular numbers.
- **UX:** mobile-first respondent flow; progressive disclosure; white-label cleanly overrides organisation-facing surfaces.

## 10. Definition of done

A change is done when it:

- [ ] passes typecheck, tests and build, and is reviewed on a Deploy Preview
- [ ] keeps respondents anonymous on both routes and never exposes an individual response to an organisation
- [ ] shows sample size beside any score and scopes every claim to "of those who have completed the Index"
- [ ] leaves every locked instrument version unchanged, and shows only the live version's questions anywhere
- [ ] works on a low-end phone, offline
- [ ] would still work if a new age cohort were added tomorrow

---

## Appendix: repo operating notes

Carried over from the previous `CLAUDE.md`. Where these and sections 1–10 differ, sections 1–10 win.

### A. Platform mechanics

- **Survey versions (item sets, migration 0044).** Defined in the instrument (`item_sets`): `full` and `j12` (screener + all 48 scored items + demographics; no Drivers, Journey, modules or extras offer). An organisation's default lives on its `default` campaign (Survey settings → Survey version); a distribution link can override it; `sessions.item_set` records what each respondent was actually shown. Every set asks scored items identically, so scores stay comparable.
- **One survey link per organisation (migration 0044).** The community/public split is retired; `/[org]/open` redirects to `/[org]`. Old `open` campaigns stay active only so answers queued on phones still land.
- **Team tiers (migration 0043).** Administrator (`app_users.role = 'admin'`, the Collab) · **Org Administrator** (`org_members.role = 'org_admin'`, exactly one per organisation, unique index) · **Coordinator** (`'coordinator'`, up to `platform_settings.org_coordinator_limit` = 5, pending invites included; sandbox exempt) · Respondent (no account). The first verified person claims an unclaimed organisation; everyone after that comes in by invitation from the dashboard's *Team & access* view. Coordinators use the dashboard as is; settings, consent, branding and the team are the Org Administrator's (`_require_org_admin`, role checks in 0036/0037/0042/0043).
- **Scores are reported on a 1–5 scale** (raw Likert means), not 0–100 — see migration `0029_score_scale_1_to_5.sql`. Internal storage (`responses.normalized`, `ngjfi_normalize()`) stays 0–100; only each RPC's final output converts, via `ngjfi_to_5()`.
- **Org dashboard has a season picker** (`org_seasons()`/`org_dashboard_season()`, migration `0030`) — the season boundary (default: 1 Jun) is versioned config in `platform_settings`, not hardcoded — plus CSV exports and a PDF-oriented print view, and a "what do we do with this?" consulting-question button feeding a Collab-facing repository (`consulting_questions`, reviewed from the Collab console).
- **View-only share links (migration 0046).** An Org Administrator or Coordinator makes a read-only link (`/view/<token>`) from the dashboard's *Team & access* view (below the team), for the whole house or one room, with an expiry (≤ `share_link_max_days`), an optional passcode, and map/detail switches. Tokens are stored only as sha256; views are counted, never attributed. A shared view reads the SAME cores as the dashboard (`_org_dashboard_core`, `_link_dashboard_core`) and holds the SAME minimums — there is no share-specific threshold, and there must never be one. The org's matrices carry no Collab overlay or benchmark; the heat map is the dashboard's own (`collab_intelligence()` countries — all data per country — plus the scope's reach outlines). `/view` is a reserved short name. See `docs/RELEASE_0046_0047.md`.
- **Non-followers: counted in completions, scored apart (migration 0047).** Every completion counts — the dashboard's *Completed the Index* is a total segmented into following / not yet following (`completions`), while `n` stays the J12's own n. Non-followers' answers never enter the J12, its trend, any benchmark or the Collab console (one branch condition added to each); they're scored only in the **Unengaged matrix** (the Exploration Index), a view beside the J12 that unlocks in any space — house, season or room — at the same floor the J12 holds there (`min_group_n` / `room_min_n`). `retained_aggregates` is keyed by branch. The demo preview (`org_dashboard_demo`) now reads the same core as the product.
- **Collection lock (migration 0048).** Until pilot readiness is signed off, real links run end to end but nothing is stored or pooled: the anonymous write RPCs no-op after their test-link branch, and triggers refuse any live session/response for a non-demo org. `platform_settings.collection_locked` fails closed (missing = locked); the survey shows a *not collecting yet* notice. Test links and `discard_session` are unaffected. Unlock only by a migration — see `docs/PILOT_LAUNCH_CHECKLIST.md` §6.
- **Pilot safeguards (migration 0042):** edge-consent confirmation gates collection; under-13 exit (`discard_session`); free-text redaction; retention must be decided before any purge; rooms never name a place below `min_group_n`; `pilot_readiness()` behind the admin console's *Pilot readiness* band. See `docs/PILOT_LAUNCH_CHECKLIST.md`.
- **Pilot round (migrations 0049–0053, Oct 2026).** Readiness reports org consent per organisation, not as a launch gate (0049). **Two-stage retention** (0050): at `respondent_deidentify_after_days` (60) `deidentify_stale_sessions()` truncates time to the month, deletes city and free text, folds room links; de-identified rows kept `respondent_retention_months` (60), purge refuses anything still identifiable; pg_cron daily. Readiness hand sign-offs with who/when/note (0051). **Who answered** breakdowns and **survey completion** (0052) — one whitelisted dimension at a time, floors + complementary suppression, labels from the instrument. **Two-level consent** (0053): per organisation and per survey sent (`survey_consents`, append-only), no consent no participation, age bands enforced, 21-country `consent_country_rules` from `src/data/consent-countries.json`, admin *Consent register*. One consent resource at `/resources/consent` (and `/[org]/consent`). DB tests: `scripts/test-db.sh` + `tests/db/*.sql`, run in CI on postgres:17.

**Also open (carried over):** confirm migrations 0043–0045 are applied (v5 locked in the database), server-side refusal of answers outside a session's item set (today the phone simply never asks them), Spanish sign-off, the retention open points (free-text handling, time grain, counsel on anonymity), counsel review of `/privacy` and `/terms` and the org agreement, the pitch's "major shifts / where you differ / suggested focus" panels, a season-aware benchmark RPC (the season picker currently compares against the Collab's all-time baseline regardless of the season selected), and a city-level reporting surface (none exists yet — build the city gate before one does).

### B. Working rules

- **The demo must never diverge from the product.** The landing page, the guided tour at `/tour` and the live product render the *same* components — `components/survey/QuestionCard` and `components/index/Figures` — and `lib/sample.ts` derives every sample figure from the instrument JSON at render time. Never write a fixture, never fork a component "just for the demo". `tests/sample.test.ts` fails the build if you do.
- **Demo lives on one page (round 4b, Oct 2026).** Everything demo — the three sample organisations ("See your: Ministry · Organisation · Church": `SAMPLE_MINISTRY`, `SAMPLE_ORG`, `SAMPLE_CHURCH` in `lib/sample.ts`) and the global view (`LiveSnapshot`) — lives on `/see-a-demo` ("See a Demo" in the nav; `see-a-demo` is a reserved short name, migration 0057). The front page shows **no figures**, real or invented. On the demo page every invented figure sits inside a `<DemoFrame>`, and every page that can show one renders `<DataLabel kind="demo">` (`components/site/DataLabel.tsx` — the wording lives there once). The global view's demo map reads the sandbox first and falls back to `sampleWorld()` so it never goes empty after `delete_demo_data.sql`; live figures never come from either.
- **Two data spaces.** `is_demo = false` is the live space and the only thing `/intelligence` publishes; `is_demo = true` is the sandbox. The split is enforced inside the SECURITY DEFINER functions and by a trigger, not by remembering a WHERE clause. Verify with `select public.data_space_report();` before any announcement.
- **Standing up a fresh database:** `npm run db:bootstrap` regenerates `supabase/bootstrap.sql` — every migration in order, one paste into a new project's SQL editor. It deliberately excludes the demo seeds.

### C. Design rules in detail

**Brand Proof № 3** (Sep 2026) — white ground, coral as the single working colour, rounded corners and soft shadows back in. This replaced the earlier "almanac" system (Brand Proof № 2, Aug 2026 — warm paper, square corners, no shadows, all-serif body copy); if you're picturing that version, you're thinking of the old one. Density is still credibility — the almanac's numbered figures, hairline rules and asymmetric grid stay — but the surface is no longer trying to look printed.

- **The tier ramp:** one hue (coral), four lightnesses — Exposure `#FDECE2` → Response `#FFB894` → Formation `#FF9464` → Multiplication `#FF7A47`. Lightness alone encodes journey depth, so the heat grid reads as a progression, not four unrelated categories.
- **The masthead carries the name and the mark, everywhere (round 4, Oct 2026).** Header = the rising mark (`RisingMark`, coral → violet badge) beside the serif lockup **The *Jesus* Index** — signed-out or signed-in, marketing page or console, same treatment (see `Masthead` in `src/components/site/Chrome.tsx`). "J.FIND.x"/"JFINDX" is retired from every surface a person reads; `jfindx.org` stays the address and file names may still say `jfindx`. `tests/round4.test.ts` fails if the old name creeps back.
- **The rule of voices, updated — and this is a hard rule, not a preference:** controls (buttons, links styled as buttons, nav links, tabs, badges/pills) are **Inter Tight**, plain weight and case — `font-semibold`, normal case, no letter-spacing. The tracked-uppercase-mono treatment (`tabular uppercase tracking-[...]`) is reserved *only* for genuine data captions: stat labels sitting directly above a number, table column headers, figure captions (`.figcap`). If you're about to put `uppercase tracking` on something a person clicks, don't — that was Brand Proof № 2's voice for every control, it silently survived the token swap once already (an entire sweep in Sep 2026 was needed to remove it from buttons and nav across the whole site), and it must not creep back in per-component. **Newsreader** stays for exactly one use, the `.wordmark` masthead/hero lockup, not a second voice for general text. Numbers are tabular mono, **JetBrains Mono** (moved from IBM Plex Mono).
- **Rounded corners and soft shadows are back, and must actually be applied.** The almanac's collapse-to-0 is gone from the Tailwind config, but a card, list wrapper, or stat box only renders rounded if its markup uses a `rounded-*` class — the config alone doesn't retrofit old square-cornered `border` divs. Any bordered box holding a list of rows or a set of stats gets `rounded-xl` (or `rounded-2xl` for a large standalone panel, `rounded-md`/`rounded-lg` for small chips and buttons) plus `shadow-sm` if it sits directly on the page background. Use the shared `Rows`/`Worklist`/`LinkRow` components in `src/components/console/Bands.tsx` for list-shaped content instead of hand-rolling a `<ul className="border-t border-ink">` — that hand-rolled pattern is the old almanac list and several pages still had it.
- **Still refused:** gradients beyond the mark and the masthead buttons · glassmorphism · scroll-triggered animation · emoji as icons · the centered hero with three feature cards.
- **Still kept:** hairline and double rules · numbered figures with captions · footnotes and sources · asymmetric grid with marginalia · a colophon.
- **The admin console (`/build`) intentionally does NOT fork a separate visual identity from the rest of the site**, even though the demo's `Admin.dc.html` board sketches one (a violet "Collab staff only" header treatment). `Console.tsx` renders all four tiers — organisation, network, Collab, administrator — through the same `Shell`/`Band`/`Rows` components everyone else uses, on purpose (see the file's own header comment: "the five bands are the same components in the same order... a bug in it can make the UI wrong but cannot leak a number"). It got the same rounded-card/plain-control treatment as everywhere else instead. If the console ever needs its own distinct "internal tool" identity, that is a deliberate, separately-scoped decision — not a byproduct of a visual sweep.
