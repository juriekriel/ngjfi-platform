# The guardrails, and why each one exists

`CLAUDE.md` states these as rules. This is the reasoning, because a rule you understand
survives contact with a situation its author didn't foresee.

---

## Colour is load-bearing

Three colours carry meaning here and they are not interchangeable:

| Token | Means | Used by |
|---|---|---|
| `--c-emerald` `#0B8A60` | the single working colour, **and "up"** | brand marks, positive `delta()`, `heat()`, top of the tier ramp |
| `--c-navy` `#35639C` | levels and benchmarks, never anything else | domain bars, benchmark comparisons |
| `--c-vermillion` `#B5451B` | **"down"**, and only ever "down" | negative `delta()` |

The tier ramp (`--c-tier-*`) is one emerald at four lightnesses. **Hue is constant;
lightness alone encodes journey depth.** That is what makes the heat grid read as a
progression rather than four unrelated categories.

**The collision.** Vermillion sits at roughly hue 19° — red-orange. Most "warm brand"
candidates (terracotta, rust, burnt orange) land between 15° and 30°, on top of it. Make
the brand warm-red and a rising figure and a falling figure become the same family: the
reader loses the instant up/down read, which is most of what a dashboard is for.

Any warm brand therefore has to either clear hue ~40° (amber, ochre, gold) or move what
carries "up". `docs/PALETTE.md` works through three options and what each costs. Read it
before changing any colour, and judge the result on a deploy preview — on a phone in
daylight and on a laptop — not from a swatch.

**Where colour lives:** the `:root` block in `src/app/globals.css`. Nothing else. If you
write a hex in a component, the system is broken; put it in `:root` and reference the
token. The single deliberate exception is `SAMPLE_ORG.brand` in `src/lib/sample.ts` — a
white-label ministry's *own* colour, org data rather than a platform token. Re-skinning the
Index must never silently re-skin someone else's brand.

---

## Privacy is a feature, not a setting

Respondents are anonymous: no names, emails, precise location or IP. Age is a **band**,
never a birthdate. Consent — including parental consent for minors — is handled at the edge
by each organisation.

**Never design anything that centrally holds identifiable data about under-18s.** This is
the hardest line in the project. It is not a preference to be traded against a feature.

Organisations see **aggregates only**. No individual response is ever exposed to an org,
regardless of how useful it would be.

---

## Never overclaim

Report only on *"those who have completed the Index"* — never a whole population. Sample
size appears wherever a score appears. Benchmarks stay hidden until a geography passes the
critical-mass gate.

The credibility of the whole instrument rests on this. A single overclaiming number in
front of the Collab costs more than any feature gains.

---

## Never lock the instrument

Items, scales, tags, reverse flags, translations and scoring are **versioned config**, never
hard-coded. Responses bind to the instrument and scoring version they were captured under,
so re-scoring is always possible.

Edit `src/data/instrument.v1.json`, then `npm run db:seed`. v0 is archived, not deleted.

**Instrument wording and scoring are researcher-owned.** Propose, don't change.

---

## Build for the age-range future now

The Index starts at 13–30 and will become a whole-life tracker. Expansion must be
configuration, not a rewrite.

- **Never hard-code age bands.** `13_17 / 18_22 / 23_30` are *data* in the instrument
  config, not constants in code or SQL. Adding `31_45` or a children's band must need no
  schema change.
- Keep naming neutral: prefer `index`, `instrument`, `cohort`, `respondent` over
  `nextgen`/`youth` in table, column and function names. Brand naming lives in UI copy.
- Keep scoring generic — the engine scores any tagged item set. No age-specific logic.

The test: *would this still work if we added a 45–65 cohort tomorrow?* If no, generalise it.

---

## The demo must never diverge from the product

The landing page, `/tour` and the live product render the **same** components —
`components/survey/QuestionCard` and `components/index/Figures` — and `lib/sample.ts`
derives every sample figure from the instrument JSON at render time.

Never write a fixture. Never fork a component "just for the demo".
`tests/sample.test.ts` fails the build if you do.

A demo that has drifted from the product is a demo that lies to the people deciding whether
to adopt the Index.

---

## Migrations, not dashboard edits

The schema is code. Migrations are numbered files in `supabase/migrations/`, applied in
order, reviewable in a PR — which is what keeps every developer, preview and production
database identical.

**Claim the number in chat before you start.** Two people working in parallel will
otherwise both create `0015` and the second to merge breaks. Highest at time of writing is
`0014`; run `ls supabase/migrations/` for the real current number.

**Never edit a migration already merged to `main`.** It has already run against the
database. Write a new one that corrects it.

Note: the Supabase dashboard has shown *No migrations / No repository connected* for this
project — the migration history isn't linked there. Confirm with Jurie how migrations are
actually being applied before writing your first one.

---

## Secrets, in a public repo

`juriekriel/ngjfi-platform` is **public**. Anyone can read every commit, and anything pushed
is public forever even if deleted afterwards.

- Only `NEXT_PUBLIC_*` values may reach the browser
- Never commit `.env.local`, the service-role key, or the database password
- Never paste any of them into chat
- The app runs on the anon key plus RLS alone — that key is safe in the browser by design
- Found a secret in the repo? Stop and say so. It needs rotating, not deleting

---

## The design system refuses things on purpose

**An almanac, not an app.** Density is credibility: airy hero sections say marketing, set
tables say measurement.

**Refused** — gradients, glassmorphism, rounded cards, shadows, scroll-triggered animation,
emoji as icons, the centered hero with three feature cards. `borderRadius` and `boxShadow`
collapse to nothing in `tailwind.config.ts`, so several of these cannot be written even by
accident.

**Kept** — hairline and double rules, numbered figures with captions, footnotes and
sources, an asymmetric grid with marginalia, square corners, a colophon.

**The rule of voices** — a sentence is **Newsreader**; a number is **IBM Plex Mono**,
tabular; a control is **Inter**. No exceptions. Enforced by a global CSS selector, not by
discipline.

---

## Ask before

Changing instrument wording or scoring · spending money (domains, paid tiers) · deleting
data · anything that would centralise identifiable data · resolving a merge conflict on
someone else's work.

"Clay, not a vase" applies to the *model* — flag assumptions, propose better, expect it to
be reshaped. It does not apply to the non-negotiables above.
