# Pilot launch checklist

Work through this top to bottom before the first organisation hands a **real**
(non-test) link to a young person. The admin console's **Pilot readiness** band
(Console → D, migration 0042) runs the database checks for you; everything else
is here because no database can see it.

Owner column: **R** = researchers · **J** = Jurie / platform · **C** = Collab
leadership / counsel · **O** = each pilot organisation.

## 1. Decisions (nobody can build these)

| # | Decision | Owner | Where it lands |
|---|---|---|---|
| 1 | Sign off instrument **v5** as fielded, including the 0042 amendments: the *12 or younger* age option that ends the survey, and `welcome_minutes: 6` | R | `src/data/instrument.v5.json` note |
| 2 | Field the draft **Belong–Trust** module in pilots, or not? Default is **not** (`field_draft_items: false`). Flip to `true` only once the wording is agreed | R | same file |
| 3 | Record the prayer / scripture decision (unscored frequencies, reported beside the Index) as the formal answer to non-negotiable #5 | R | instrument note + `CLAUDE.md` §3 |
| 4 | Confirm the gates: `critical_mass_gate` 400, `country_critical_mass_gate` 2000, `min_group_n` 10 — or change them | R | `platform_settings` via a migration |
| 5 | ~~Decide the **retention period**~~ **Decided (Matthew, 7 Oct 2026):** pseudo-markers kept 60 days, de-identified answers up to 5 years (0050). Still open: free text *delete* vs *code then delete* (`deidentify_free_text`), month vs quarter (`deidentify_time_grain`), and counsel's view that de-identified answers are anonymous | R + C | `platform_settings` via a migration |
| 6 | Approve the **consent statements** — organisation *and* per survey — and the **"Why consent?"** text and **country reference** (`src/lib/consent.ts`, `src/content/consent/why-consent.ts`, `src/data/consent-countries.json`, all `2026-10-v1`) | C | bump each version in the file *and* its setting together |
| 7 | Counsel review of `/privacy`, `/terms` and who is controller of the pooled data (US, Argentina first; then South Africa/POPIA, Brazil/LGPD) | C | remove the draft banner in `src/components/site/LegalPage.tsx` |
| 8 | Spanish sign-off, then `es` → `live` in `src/data/locales.json` (Buenos Aires can't record Spanish until then) | R | `docs/TRANSLATION.md` |

## 2. Platform settings (outside the repo)

- [ ] **Custom SMTP** connected in Supabase Auth (Resend already sends the waitlist mail), and the email rate limit raised — exact settings in `docs/AUTH_EMAILS.md` §3. The built-in sender allows only a few emails an hour for the whole project.
- [ ] **pg_cron** enabled (Database → Extensions) so `deidentify_stale_sessions()` runs daily; 0050 schedules it when the extension exists. Otherwise schedule it another way — readiness turns red if anything is overdue.
- [ ] **Supabase plan with restorable backups.** The free tier pauses idle projects and has no restorable backups. *(Spend decision.)*
- [ ] **`main` branch-protected**: PR + passing CI required, no bypass (`claude_JFINDX_Access_Setup_Session.md`, step 1).
- [ ] **A second key-holder** for the Supabase service-role key, and a documented fallback if the Mac Studio publisher is asleep during a pilot week.
- [ ] `jfindx.org` resolves, and the Supabase Site URL + redirect URLs point at it.

## 3. Database (the Pilot readiness band checks these)

- [ ] Migration **0042** applied (`GET /api/migrations` on the publisher shows nothing waiting).
- [ ] `npm run db:seed` run after the instrument change, and exactly one instrument version is active.
- [ ] `publish_global_view` is still `false`.
- [ ] Consent is **per organisation, not a launch gate** (0049): the band lists who is collecting and who is waiting; each organisation's own links stay closed until it confirms.
- [ ] Retention is set (0050: 60 days, then de-identified; 60 months) and nothing is past the de-identification window.
- [ ] The five hand checks are confirmed in the band, with a note where required (0051).
- [ ] `select public.data_space_report();` — the live space holds only real pilot organisations.

## 4. Rehearsal (on a Deploy Preview, then on production with a test link)

- [ ] Answer "12 or younger": the survey ends politely, and no session exists for it afterwards.
- [ ] Go offline after opening the survey; answer everything; reconnect — the response arrives once.
- [ ] Type an email address and phone number into the free-text question — they arrive as `[removed]`.
- [ ] A real link for an organisation that hasn't confirmed consent says it isn't collecting yet; its **test** link still works.
- [ ] With organisation consent but **no survey consent**, the link and QR are hidden on the dashboard, the printable cards refuse, and the real link says it isn't open yet (0053).
- [ ] Consent a survey for **18+ only**; answer "13–17": the survey ends politely and nothing is kept.
- [ ] While collection is locked (0048): a real link runs end to end, shows the *Preview — not collecting yet* notice, and leaves no session or response behind. Its **test** link still records to test tables.
- [ ] Confirm consent; with collection unlocked on a Deploy Preview database, the real link now records.
- [ ] Keyboard only, and a phone screen reader (VoiceOver / TalkBack): every question and choice is announced and reachable.
- [ ] Time three real 13–17-year-olds through the main set. If the median is far from the 6 minutes the welcome promises, change `welcome_minutes` (a test keeps it plausible).
- [ ] The organisation's dashboard shows sample size next to every score, and a room with fewer than `min_group_n` people from a place never names that place.

## 5. Per pilot organisation (the 30-minute onboarding call)

- [ ] Organisation created and **activated**; its admin has signed in.
- [ ] Logo, colour and welcome message set.
- [ ] Their consent process walked through with the **consent resource** (`/resources/consent`, or `/<org>/consent` in their branding); **organisation consent** confirmed in Survey settings by their admin.
- [ ] **Each survey they'll send** consented on its card — countries, age groups, parental-consent method; local advice recorded for China, Saudi Arabia or Pakistan.
- [ ] A test link tried by their team; test answers purged (Admin → Manage → purge test data).
- [ ] Real links / QR codes created per room (camp, youth night, …).
- [ ] A completion target agreed (e.g. "120 at camp in March").

## 6. Unlock collection (the last step)

Real links run but collect nothing until this is done (migration 0048,
`platform_settings.collection_locked`). Only when sections 1–5 are complete:

- [ ] The Pilot readiness band is all green, and the items it can't check are ticked above.
- [ ] Open a PR adding a new migration that sets `collection_locked` to `false` — **never** a toggle in the Supabase dashboard. The PR description names who signed off readiness.
- [ ] After it merges and the publisher applies it: one real completion appears on the pilot org's dashboard.

## After the first wave

- [ ] Research notes from each onboarding call sent to the researchers.
- [ ] Nothing from the demo sandbox quoted anywhere as a finding.
