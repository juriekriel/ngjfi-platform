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
| 5 | Decide the **retention period** for raw answers. Until set, nothing is ever purged | R + C | `platform_settings.respondent_retention_months` via a migration |
| 6 | Approve the **consent statement** orgs confirm (`src/lib/consent.ts`, version `2026-10-v1`) | C | bump the version in the file *and* the setting together |
| 7 | Counsel review of `/privacy`, `/terms` and who is controller of the pooled data (US, Argentina first; then South Africa/POPIA, Brazil/LGPD) | C | remove the draft banner in `src/components/site/LegalPage.tsx` |
| 8 | Spanish sign-off, then `es` → `live` in `src/data/locales.json` (Buenos Aires can't record Spanish until then) | R | `docs/TRANSLATION.md` |

## 2. Platform settings (outside the repo)

- [ ] **Custom SMTP** connected in Supabase Auth (Resend already sends the waitlist mail), and the email rate limit raised — see `docs/AUTH_EMAILS.md`. The built-in sender allows only a few emails an hour for the whole project.
- [ ] **Supabase plan with restorable backups.** The free tier pauses idle projects and has no restorable backups. *(Spend decision.)*
- [ ] **`main` branch-protected**: PR + passing CI required, no bypass (`claude_JFINDX_Access_Setup_Session.md`, step 1).
- [ ] **A second key-holder** for the Supabase service-role key, and a documented fallback if the Mac Studio publisher is asleep during a pilot week.
- [ ] `jfindx.org` resolves, and the Supabase Site URL + redirect URLs point at it.

## 3. Database (the Pilot readiness band checks these)

- [ ] Migration **0042** applied (`GET /api/migrations` on the publisher shows nothing waiting).
- [ ] `npm run db:seed` run after the instrument change, and exactly one instrument version is active.
- [ ] `publish_global_view` is still `false`.
- [ ] Every active pilot organisation has **confirmed consent** (Survey settings → Consent).
- [ ] A retention period is set (decision 5).
- [ ] `select public.data_space_report();` — the live space holds only real pilot organisations.

## 4. Rehearsal (on a Deploy Preview, then on production with a test link)

- [ ] Answer "12 or younger": the survey ends politely, and no session exists for it afterwards.
- [ ] Go offline after opening the survey; answer everything; reconnect — the response arrives once.
- [ ] Type an email address and phone number into the free-text question — they arrive as `[removed]`.
- [ ] A real link for an organisation that hasn't confirmed consent says it isn't collecting yet; its **test** link still works.
- [ ] Confirm consent; the real link now records.
- [ ] Keyboard only, and a phone screen reader (VoiceOver / TalkBack): every question and choice is announced and reachable.
- [ ] Time three real 13–17-year-olds through the main set. If the median is far from the 6 minutes the welcome promises, change `welcome_minutes` (a test keeps it plausible).
- [ ] The organisation's dashboard shows sample size next to every score, and a room with fewer than `min_group_n` people from a place never names that place.

## 5. Per pilot organisation (the 30-minute onboarding call)

- [ ] Organisation created and **activated**; its admin has signed in.
- [ ] Logo, colour and welcome message set.
- [ ] Their consent process walked through; **Consent** confirmed in Survey settings by their admin.
- [ ] A test link tried by their team; test answers purged (Admin → Manage → purge test data).
- [ ] Real links / QR codes created per room (camp, youth night, …).
- [ ] A completion target agreed (e.g. "120 at camp in March").

## After the first wave

- [ ] Research notes from each onboarding call sent to the researchers.
- [ ] Nothing from the demo sandbox quoted anywhere as a finding.
