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

1. **Never overclaim.** Report only on *"those who have completed the Index"* — never a whole population. Show sample size wherever a score appears. Benchmarks stay hidden until a geography passes the **critical-mass gate**, which is tiered and checked independently at each level:
   - **City/area and organisation/region level:** `critical_mass_gate` (e.g. n ≥ 400). City/area is free text, so a small town could become identifying long before its country clears the country gate — no surface may name a city/area below this gate (and no room may name a place below `min_group_n`, migration 0042).
   - **Country level:** `country_critical_mass_gate` (N ≥ 2,000). Below it the country stays hidden, even if cities inside it have cleared their own gate.
   - Both are versioned config in `platform_settings`, never hard-coded. A country clearing its gate says nothing about any city inside it, and vice versa.
2. **Privacy is a feature, not a setting.** Respondents are **anonymous**: no names, emails, precise location or IP stored with answers. Age is a **band**, never a birthdate. Consent — including parental consent for minors — is handled **at the edge** by each organisation, which confirms it has done so before it can collect (migration 0042); the Index never holds consent records. **Never** design anything that centrally holds identifiable data about under-18s. The screener's faith-status answer is sensitive on its own and more so combined with age band + coarse geography — it gets the same anonymity guarantee as every Index response, with no path back to an individual. Free text is redacted of emails, phones, URLs and handles on write (0042). Under-13s are ended at the age question and nothing about them is kept.
3. **Never lock the instrument.** Items, scales, tags, reverse flags, translations, scoring and **section type** are versioned config, never hard-coded. Every scored item carries an orientation tag (`measure`: internal / external) and every question a section tag (screener / index / driver / journey / demographic / exploration / module) — both config, not code. Responses bind to the instrument + scoring version they were captured under, so re-scoring is always possible — which is why raw rows are only purged under an explicitly decided retention period (`respondent_retention_months`, 0042).
4. **White-label means theirs.** Org-facing surfaces carry the org's brand; the Index sits in the footer.
5. **Keep the two core activities measurable.** Weekly prayer and weekly scripture engagement must always be measurable. They are asked as unscored frequency items (`pray_frequency`, `scripture_frequency`, PR #65) in the full survey — reported through the insight layer, not the Index score. **Recorded as a decision** in v5's lock (`instrument.v5.json` → `lock.decisions_recorded`, Oct 2026). The J12-only version leaves them out (config: `item_sets.j12.exclude_keys`).
6. **Orgs see aggregates only.** No individual response is ever exposed to an organisation — including Drivers, Journey and module answers. Those are unscored but still respondent data: report them as aggregate option-selection rates only, behind the same gates as scores.
7. **Clay, not a vase.** This is a starting brief. Flag assumptions, propose better, expect the model to be reshaped by researchers and the Collab.
8. **Screener eligibility is config, not a hard-coded filter.** Which faith-status answers continue into which branch, and which answers end the survey (`ends_survey` on an option, e.g. under 13), are versioned rules on the item — never an `if` in code. Future cohorts (adult, children) will each need their own rules.
9. **Insight layers never silently become score.** Drivers, Journey and module answers are never blended into a dimension, tier or cell score without an explicit, versioned scoring decision. They are reported alongside the Index, not folded into it.
10. **Non-eligible respondents get the same privacy bar.** Anyone routed away from the Index (not following, or under age) gets the same anonymity, consent and no-identifiable-data guarantees as someone who completes it.

Draft wording is never fielded by accident: items marked `draft` stay in the instrument but are only shown when the instrument sets `field_draft_items: true` — a researcher's decision.

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

## 6. Current state (as of Oct 2026)

A working platform is already live — see **`NGJFI_Session_Context.md`** for the full handover.

- **Live:** `ngjfi-platform.netlify.app` — respondent survey `/[org]`, org dashboard `/[org]/dashboard` (+ `/[org]/dashboard/export` for print/PDF), marketing site (`/`, `/learn`, `/tour`, `/history`, `/organisation`, `/join`, `/access`), Collab Intelligence `/intelligence`
- **Repo:** `github.com/juriekriel/ngjfi-platform` (public)
- **Stack:** Next.js (App Router) + TypeScript + Tailwind · Supabase (Postgres + RLS + Auth) · Netlify
- **Built:** multi-tenant schema + RLS, anonymous-write RPCs, tested scoring engine, versioned v5 instrument (EN live; ES in review; v5 = v4 + the draft Belong–Trust items, which are held back from respondents until fielded), magic-link auth with **ministry website-domain verification**, funnel / heat-grid / findings / world map / trends, CI with PR previews.
- **v5 is LOCKED (migration 0045, 1 Oct 2026).** Items, English wording, scoring, `field_draft_items` and item-set composition are frozen — enforced by `tests/instrumentLock.test.ts` (fingerprint in `src/data/instrument.locks.json`) and by database triggers (`instrument_lock_projection()`, the same projection as `src/lib/instrumentLock.ts`). Translations stay editable. **Any other change is v6** — never edit a fingerprint to make the test pass. `select instrument_status();` confirms what is live.
- **Survey versions (item sets, migration 0044).** Defined in the instrument (`item_sets`): `full` and `j12` (screener + all 48 scored items + demographics; no Drivers, Journey, modules or extras offer). An organisation's default lives on its `default` campaign (Survey settings → Survey version); a distribution link can override it; `sessions.item_set` records what each respondent was actually shown. Every set asks scored items identically, so scores stay comparable.
- **One survey link per organisation (migration 0044).** The community/public split is retired; `/[org]/open` redirects to `/[org]`. Old `open` campaigns stay active only so answers queued on phones still land.
- **Team tiers (migration 0043).** Administrator (`app_users.role = 'admin'`, the Collab) · **Org Administrator** (`org_members.role = 'org_admin'`, exactly one per organisation, unique index) · **Coordinator** (`'coordinator'`, up to `platform_settings.org_coordinator_limit` = 5, pending invites included; sandbox exempt) · Respondent (no account). The first verified person claims an unclaimed organisation; everyone after that comes in by invitation from the dashboard's *Team & access* view. Coordinators use the dashboard as is; settings, consent, branding and the team are the Org Administrator's (`_require_org_admin`, role checks in 0036/0037/0042/0043).
- **Scores are reported on a 1–5 scale** (raw Likert means), not 0–100 — see migration `0029_score_scale_1_to_5.sql`. Internal storage (`responses.normalized`, `ngjfi_normalize()`) stays 0–100; only each RPC's final output converts, via `ngjfi_to_5()`.
- **Org dashboard has a season picker** (`org_seasons()`/`org_dashboard_season()`, migration `0030`) — the season boundary (default: 1 Jun) is versioned config in `platform_settings`, not hardcoded — plus CSV exports and a PDF-oriented print view, and a "what do we do with this?" consulting-question button feeding a Collab-facing repository (`consulting_questions`, reviewed from the Collab console).
- **Demo data:** 26 synthetic orgs, ~79k responses, all flagged `is_demo` — **delete before official testing/launch** via `supabase/delete_demo_data.sql`. Every FK back to `organisations` cascades, so this one statement is sufficient.

- **View-only share links (migration 0046).** An Org Administrator or Coordinator makes a read-only link (`/view/<token>`) from the dashboard's *Team & access* view (below the team), for the whole house or one room, with an expiry (≤ `share_link_max_days`), an optional passcode, and map/detail switches. Tokens are stored only as sha256; views are counted, never attributed. A shared view reads the SAME cores as the dashboard (`_org_dashboard_core`, `_link_dashboard_core`) and holds the SAME minimums — there is no share-specific threshold, and there must never be one. The org's matrices carry no Collab overlay or benchmark; the heat map is the dashboard's own (`collab_intelligence()` countries — all data per country — plus the scope's reach outlines). `/view` is a reserved short name. See `docs/RELEASE_0046_0047.md`.
- **Non-followers: counted in completions, scored apart (migration 0047).** Every completion counts — the dashboard's *Completed the Index* is a total segmented into following / not yet following (`completions`), while `n` stays the J12's own n. Non-followers' answers never enter the J12, its trend, any benchmark or the Collab console (one branch condition added to each); they're scored only in the **Unengaged matrix** (the Exploration Index), a view beside the J12 that unlocks in any space — house, season or room — at the same floor the J12 holds there (`min_group_n` / `room_min_n`). `retained_aggregates` is keyed by branch. The demo preview (`org_dashboard_demo`) now reads the same core as the product.
- **Collection lock (migration 0048).** Until pilot readiness is signed off, real links run end to end but nothing is stored or pooled: the anonymous write RPCs no-op after their test-link branch, and triggers refuse any live session/response for a non-demo org. `platform_settings.collection_locked` fails closed (missing = locked); the survey shows a *not collecting yet* notice. Test links and `discard_session` are unaffected. Unlock only by a migration — see `docs/PILOT_LAUNCH_CHECKLIST.md` §6.
- **Pilot safeguards (migration 0042):** edge-consent confirmation gates collection; under-13 exit (`discard_session`); free-text redaction; retention must be decided before any purge; rooms never name a place below `min_group_n`; `pilot_readiness()` behind the admin console's *Pilot readiness* band. See `docs/PILOT_LAUNCH_CHECKLIST.md`.
- **Also live:** the PWA layer (service worker + offline outbox), QR distribution, org onboarding (pending → active), the instrument admin UI (`/build/instrument`), test links, draft `/privacy` and `/terms` pages (pending counsel).

**Open:** apply migrations 0043–0045 and re-seed (locks v5 in the database), server-side refusal of answers outside a session's item set (today the phone simply never asks them), Spanish sign-off, a retention decision, counsel review of `/privacy` and `/terms` and the org agreement, the pitch's "major shifts / where you differ / suggested focus" panels, a season-aware benchmark RPC (the season picker currently compares against the Collab's all-time baseline regardless of the season selected), and a city-level reporting surface (none exists yet — build the city gate before one does).

---

## 7. How to work on this project

**Multiple people build here. Treat the repo as the single source of truth.**

- **Never push to `main`.** Branch (`feat/…`, `fix/…`, `db/…`), open a PR, review the Netlify Deploy Preview, keep CI green, squash-merge.
- **Database changes are always migrations** — a new numbered file in `supabase/migrations/`. **Never hand-edit tables in the Supabase dashboard.**
- **Instrument changes** go in a NEW version file (`src/data/instrument.v6.json`) because v5 is locked — only translations may still change in `instrument.v5.json`. `src/lib/instrument.ts` imports the live version directly; then `npm run db:seed` (which upserts items, adopts, and locks when the JSON says `lock.locked`). Earlier versions are archived, not deleted — responses bind to the version they were captured under. If scoring logic changes, update **both** `src/lib/scoring.ts` and the SQL `ngjfi_normalize`/`ngjfi_to_5`, and add a test.
- **The demo must never diverge from the product.** The landing page, the guided tour at `/tour` and the live product render the *same* components — `components/survey/QuestionCard` and `components/index/Figures` — and `lib/sample.ts` derives every sample figure from the instrument JSON at render time. Never write a fixture, never fork a component "just for the demo". `tests/sample.test.ts` fails the build if you do.
- **Two data spaces.** `is_demo = false` is the live space and the only thing `/intelligence` publishes; `is_demo = true` is the sandbox. The split is enforced inside the SECURITY DEFINER functions and by a trigger, not by remembering a WHERE clause. Verify with `select public.data_space_report();` before any announcement.
- **Standing up a fresh database:** `npm run db:bootstrap` regenerates `supabase/bootstrap.sql` — every migration in order, one paste into a new project's SQL editor. It deliberately excludes the demo seeds.
- **Verify before claiming done:** `npm run typecheck`, `npm test`, `npm run build`, and check the live/preview URL.
- **Secrets:** only `NEXT_PUBLIC_*` values may reach the browser. Never commit the service-role key or DB password; never paste them into chat. The app runs on the anon key + RLS alone.
- **Ask before:** changing the instrument's wording or scoring (researcher-owned), spending money (domains, paid tiers), deleting data, or anything that would centralise identifiable data.

---

## 8. Design system

**Brand Proof № 3** (Sep 2026) — white ground, coral as the single working colour, rounded corners and soft shadows back in. This replaced the earlier "almanac" system (Brand Proof № 2, Aug 2026 — warm paper, square corners, no shadows, all-serif body copy); if you're picturing that version, you're thinking of the old one. Density is still credibility — the almanac's numbered figures, hairline rules and asymmetric grid stay — but the surface is no longer trying to look printed.

**Do not restate these values in a component.** They live in `tailwind.config.ts` and `globals.css` (`:root`), and every surface reads them from there — that is why the whole platform re-skins from one file. See `docs/PALETTE.md` for the reasoning behind the warm rotation, and `project/Main.dc.html` / `project/Admin.dc.html` in the JFINDX Redesign Demo artifact for the actual reference look.

- **Ground:** Paper `#FFFFFF` (page) / `#F5F6F8` (paper-deep) · Plate `#FFFFFF` (cards) · Ink `#22252B` · Ink-2 `#5B6270` · Rules `#E2E5EA` / `#D7DBE2`
- **Coral** `#FF7A47` — the single working colour: chrome, marks, the tier ramp (the code token is still named `emerald`, kept stable on purpose — only the value moved, see `tailwind.config.ts`) · **Green** `#3F9D72` — "up" only, deliberately kept off the brand hue · **Navy** `#2F80C4` — levels and benchmarks, never anything else · **Violet** `#8B5CF6` — a domain accent (Follow), never a semantic · **Vermillion** `#C8283B` — "down" only, never decoration
- **The tier ramp:** one hue (coral), four lightnesses — Exposure `#FDECE2` → Response `#FFB894` → Formation `#FF9464` → Multiplication `#FF7A47`. Lightness alone encodes journey depth, so the heat grid reads as a progression, not four unrelated categories.
- **The masthead carries the short mark, everywhere.** Header = a 28px gradient chip (coral → violet, `linear-gradient(135deg, #FF7A47, #8B5CF6)`) beside the bold "JFINDX" wordmark — signed-out or signed-in, marketing page or console, same treatment (see `Masthead` in `src/components/site/Chrome.tsx`). The full serif "The *Jesus* INDEX" lockup is a page-hero element, used once on the homepage — it is never repeated in the header/nav bar itself.
- **The rule of voices, updated — and this is a hard rule, not a preference:** controls (buttons, links styled as buttons, nav links, tabs, badges/pills) are **Inter Tight**, plain weight and case — `font-semibold`, normal case, no letter-spacing. The tracked-uppercase-mono treatment (`tabular uppercase tracking-[...]`) is reserved *only* for genuine data captions: stat labels sitting directly above a number, table column headers, figure captions (`.figcap`). If you're about to put `uppercase tracking` on something a person clicks, don't — that was Brand Proof № 2's voice for every control, it silently survived the token swap once already (an entire sweep in Sep 2026 was needed to remove it from buttons and nav across the whole site), and it must not creep back in per-component. **Newsreader** stays for exactly one use, the `.wordmark` masthead/hero lockup, not a second voice for general text. Numbers are tabular mono, **JetBrains Mono** (moved from IBM Plex Mono).
- **Rounded corners and soft shadows are back, and must actually be applied.** The almanac's collapse-to-0 is gone from the Tailwind config, but a card, list wrapper, or stat box only renders rounded if its markup uses a `rounded-*` class — the config alone doesn't retrofit old square-cornered `border` divs. Any bordered box holding a list of rows or a set of stats gets `rounded-xl` (or `rounded-2xl` for a large standalone panel, `rounded-md`/`rounded-lg` for small chips and buttons) plus `shadow-sm` if it sits directly on the page background. Use the shared `Rows`/`Worklist`/`LinkRow` components in `src/components/console/Bands.tsx` for list-shaped content instead of hand-rolling a `<ul className="border-t border-ink">` — that hand-rolled pattern is the old almanac list and several pages still had it.
- **Still refused:** gradients (outside the masthead mark, which is the one deliberate exception) · glassmorphism · scroll-triggered animation · emoji as icons · the centered hero with three feature cards.
- **Still kept:** hairline and double rules · numbered figures with captions · footnotes and sources · asymmetric grid with marginalia · a colophon.
- **UX:** mobile-first respondent flow; progressive disclosure; white-label cleanly overrides org-facing surfaces.
- **The admin console (`/build`) intentionally does NOT fork a separate visual identity from the rest of the site**, even though the demo's `Admin.dc.html` board sketches one (a violet "Collab staff only" header treatment). `Console.tsx` renders all four tiers — organisation, network, Collab, administrator — through the same `Shell`/`Band`/`Rows` components everyone else uses, on purpose (see the file's own header comment: "the five bands are the same components in the same order... a bug in it can make the UI wrong but cannot leak a number"). It got the same rounded-card/plain-control treatment as everywhere else instead. If the console ever needs its own distinct "internal tool" identity, that is a deliberate, separately-scoped decision — not a byproduct of a visual sweep.

---

## 9. Definition of done

A change is done when it: passes typecheck, tests and build · is reviewed on a Deploy Preview · keeps respondents anonymous · never exposes individual responses to an org · shows sample size alongside any score · scopes every claim to *"of those who have completed the Index"* · works on a low-end phone · and would still work if a new age cohort were added tomorrow.
