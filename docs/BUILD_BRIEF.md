# NGJFI Platform — Build & Context Prompt

**Working title:** The Next Gen Jesus-Following Index (NGJFI) — "the Index"
**Document type:** Context / briefing prompt for the team (or AI build agent) establishing the software platform
**Status:** Draft for input and shaping. *Clay to be moulded — not a vase to be baked.*

---

## 0. How to use this document

This is the single source of context for building the NGJFI software platform. Read it whole before writing code or making architectural decisions.

If you are an AI build agent, treat everything below as authoritative project context. Your objective: **design and build a multi-tenant, white-labelled, crowdsourced faith-engagement measurement platform** — a shared survey instrument, a per-organisation dashboard, and an aggregate "Collab Intelligence" layer — that is privacy-first, translation-ready, and responsible in its claims.

Two standing rules that override convenience:
1. **The instrument is not final.** The questions below are an illustrative v0. They will be tightened by a panel of standardised-measurement researchers. Build the instrument as *data-driven and versioned*, never hard-coded.
2. **Never overclaim.** The platform reports only on *those who have completed the Index*, never on whole populations. This principle is a hard requirement baked into the reporting layer (see §6).

---

## 1. Mission & context

The **Next Gen Global Collab** is a coalition of 30+ ministries with one shared goal: **every young person (ages 13–30) with a real opportunity to follow Jesus by 2033.**

- **NXT Move** is the Collab's appointed three-year "backbone" organisation.
- **Eido Research** is the proposed technical partner / platform engine (they already build shared-measurement platforms). https://www.eidoresearch.com/
- **Co-owned IP** between NXT Move (for the Collab) and Eido Research.

**The strategic pivot this platform serves:** the Collab moved away from a centralised 50-country research study (too costly, regulated, and methodologically fragile) toward a **crowdsourced shared metric** — one instrument hundreds of organisations (down to a single local church) run for themselves, pooling anonymised data into a common picture. Grounded in the **Stanford Collective Impact** framework, the Index is the "shared measurement" condition the coalition was missing. The reference precedent is **Gallup's Q12** (give the measure away, let everyone benchmark, build intelligence and consulting on top).

---

## 2. What we are building (three outcomes)

1. **The shared metric** — a memorable, translatable instrument anyone can run.
2. **The dashboard** — each org sees its own results instantly, benchmarked to region and globe; the Collab sees aggregate intelligence.
3. **The consulting layer** — tooling that turns a score into changed strategy (the long-game, highest-value outcome).

The software must make outcomes 1 and 2 excellent and lay clean foundations for 3.

---

## 3. Core conceptual model

Two axes, one grid. **This model drives the data schema, scoring, and every visualisation.**

- **The 3 Questions** (the *what* — domains, from the Collab's founding framework):
  1. **Follow** — Do they follow Jesus? (personal faith)
  2. **Mission** — Do they participate in His mission? (outward)
  3. **World** — Does their world look different? (lived impact)

- **The 4 Tiers** (the *how deep* — the discipleship journey):
  1. **Exposure** — *have I encountered?*
  2. **Response** — *have I responded?*
  3. **Formation** — *am I being shaped?*
  4. **Multiplication** — *does it spread?*

Every question can be read at every tier → a **3 × 4 matrix**. Each survey item is tagged with **one question domain** and **one tier**. The narrowing from Exposure → Multiplication is the **"journey funnel."** The combined movement is referred to as **"gospel momentum."**

```
                 Exposure        Response          Formation        Multiplication
Follow Jesus     heard of Jesus  believes          being shaped     helps others believe
Mission          aware of call   convinced it's    practising       mobilising others
                                  theirs            witness
World             sees it should  believes it does  choices          changing their
                  matter                            reshaped         spheres
```

The two foundational **activities** that must always be measurable: **weekly prayer** and **weekly scripture engagement** (these are core to Formation and have historically been missing from drafts — ensure the instrument and schema retain them).

---

## 4. The measurement instrument (illustrative v0)

> ⚠️ Illustrative and subject to researcher revision. Implement as versioned, data-driven content — never hard-coded into UI or scoring logic.

**Properties:** ~6 minutes; mobile-first; anonymous; fully translatable (i18n); white-labelled per organisation. Organised by the 3 questions, plus a cross-cutting "journey" section and a short screener + demographics. Each item carries: `question_domain`, `tier`, `type`, `scale`, `reverse_scored` (bool), `scored` (bool — see §5), and translations.

**Item types:** `likert_5` (Strongly disagree → Strongly agree), `yes_no`, `frequency` (e.g., rarely/monthly/weekly/most-days), `single_select`, `multi_select` (cap selectable count), `screener` (may branch/terminate).

### Screener (Section 00)
- Age band — `single_select`: 13–17 / 18–22 / 23–30
- "Have you had the chance to hear the story of Jesus?" — `yes_no` (a "No" can short-path the survey) · *tier: Exposure*
- Orientation spectrum — `single_select`, 7-point: confident God doesn't exist → committed, actively growing · *tier: Exposure*

### Q1 · Follow (personal faith)
**Response (belief):**
- "I am a follower of Jesus, whom I believe is God." — `likert_5`
- "I believe forgiveness of sins is only possible through faith in Jesus." — `likert_5`
- "When deciding what you believe, what do you trust most?" — `multi_select` (diagnostic)
- "I look to my own experiences more than the Bible to understand who I am." — `likert_5` *reverse*
- "I usually decide what I believe based on what feels right to me." — `likert_5` *reverse*
- "I'm more likely to believe something if it feels meaningful or beautiful." — `likert_5` *reverse*

**Formation:**
- "By God's grace, I am becoming more like Jesus in daily life." — `likert_5`
- "I pray to God." — `frequency` *(core activity — required)*
- "I read or hear scripture." — `frequency` *(core activity — required)*
- "Where do you most often form your understanding of faith and life?" — `multi_select` (diagnostic)
- "How do you most often experience or think about God?" — `single_select`

### Q2 · Mission (outward)
**Response (conviction):**
- "Jesus is the only way to truly know God." — `likert_5`
- "Sharing the message of Jesus is optional for someone who follows Him." — `likert_5` *reverse*

**Formation:**
- "Following Jesus is something I grow in through relationships with other Christians." — `yes_no`
- "What most shapes your willingness to share your faith?" — `multi_select` (diagnostic)

**Multiplication:**
- "I look for opportunities to share my faith with others." — `likert_5`
- "In the last 6 months, have you shared about Jesus with someone who doesn't follow Him?" — `yes_no`
- "When faith comes up in your relationships, which best describes you?" — `multi_select` (diagnostic)
- "It is more important to maintain relationships than to speak the truth about Jesus." — `likert_5` *reverse*

### Q3 · World (lived impact)
**Response (belief about impact):**
- "Following Jesus leads to real good for people and the world." — `likert_5`

**Formation:**
- "My faith shapes how I live and act in the world around me." — `likert_5`
- "My life is directed toward something bigger than just myself." — `likert_5`
- "Following Jesus means my life is directed by God's purposes rather than my own." — `likert_5`
- "My faith is mainly about my personal life, not about making a difference in the world." — `likert_5` *reverse*
- "What most shapes your day-to-day priorities?" — `multi_select` (diagnostic)

**Multiplication:**
- "Following Jesus includes giving time or money toward loving people who are poor, vulnerable and on the edge of society." — `likert_5`
- "What most motivates you to care for or help others?" — `multi_select` (diagnostic)

### Section 04 · The Journey (cross-cutting detail; feeds consulting/diagnostics)
- *Exposure:* most meaningful ways you encountered the message of Jesus (`multi_select`); what made it meaningful (`multi_select`)
- *Response:* what most helped you understand and respond (`multi_select`)
- *Formation:* what helped you feel connected to a Christian community (`multi_select`); what has helped you follow Jesus most (`multi_select`); do you currently have someone helping you follow Jesus? (`single_select`)
- *Multiplication:* what helped you begin to live out / share your faith (`multi_select`); have you helped someone else grow? (`single_select`); what would help you take the next step (`multi_select`)
- *System insight:* what is most missing for people your age to follow Jesus? (`multi_select`)

### Demographics (Section 05)
- Gender — `single_select`
- Country + city — used for benchmarking geography

---

## 5. Scoring methodology (provisional — researcher-owned)

Implement scoring as a **configurable, versioned service**, not fixed constants. Default approach:

- **Normalise each scored item to 0–100.**
  - `likert_5`: `(value − 1) / 4 × 100`
  - `yes_no`: Yes = 100, No = 0
  - `frequency`: ordinal mapped across 0–100 (e.g., never 0 / monthly 33 / weekly 67 / most-days 100)
  - **Reverse-scored items:** invert (`100 − normalised`) before aggregation.
- **`scored` vs diagnostic items.** Belief/behaviour items feed the Index. Most `multi_select` "what shapes / where do you form / what helped" items are **diagnostic** (`scored: false`) — they power segmentation and consulting insight, not the score. Keep this split explicit in the schema.
- **Tier score** = mean of scored items tagged to that tier (Exposure / Response / Formation / Multiplication).
- **Question (domain) score** = mean of scored items tagged to that question.
- **Matrix cell (3×4)** = mean of scored items at that question × tier intersection (may be sparse; handle low-n gracefully).
- **Overall Index score** = mean of the four tier scores (provisional; researchers may weight). Store the formula version with each computed score.
- **Journey funnel** = the four global tier means in sequence; report tier-to-tier drop.
- Always store both the **raw response** and the **derived score**, with the scoring-version id, so re-scoring is possible when researchers revise.

---

## 6. Integrity & claims principle (HARD REQUIREMENT)

- The platform **never** presents results as representative of a nation, region, or "young people" in general.
- All reporting language is scoped: **"of those who have completed the Index, here are the results."**
- **Benchmark gating:** a country/region benchmark only becomes visible once it reaches a **critical mass threshold** (configurable, e.g., n ≥ 400 per geography). Below threshold → show "not enough data yet," never a benchmark.
- Margins of error / sample sizes are shown wherever a score is shown.
- No individual response is ever exposed to an org; orgs see **aggregates only**.

---

## 7. Privacy, consent & compliance (HARD REQUIREMENTS)

The entire pivot exists partly to move data-collection risk to the edge. The platform must reflect this.

- **Edge consent.** Each organisation runs its own instance under its own consent model. Consent (including **parental consent for minors 13–17**) is the organisation's responsibility; the platform records consent state but does not centralise minor PII.
- **Anonymity by default.** Respondent sessions collect **no personally identifying information** — no names, emails, or precise location. Geography is country + (optional) city only. Age is a band, not a birthdate.
- **No central minor data risk.** Do not design any feature that would require centrally holding identifiable data about under-18s.
- **GDPR / cross-border.** Support data-residency considerations and lawful cross-border handling; minimise and anonymise.
- **Data ownership.** Each org owns its own data and can export/delete it. Opting into the aggregate ("collective") dataset is explicit. Aggregate use is non-commercial under the Collab; both NXT Move and Eido are credited on any published result.
- **Security.** Encryption in transit and at rest; least-privilege access; full audit logging on admin actions.

---

## 8. Product modules / features

### 8.1 Organisation onboarding & white-labelling
Org signs up → uploads **logo**, sets **brand colour(s)** and display name → receives a branded survey instance ("powered by the Index" footer). The respondent experience and the org's own dashboard carry the org's identity, not the Index's. Multi-tenant; org data isolated.

### 8.2 Instrument management & versioning
Researchers manage items, tiers, tags, scales, reverse flags, translations, and the scoring config through admin tooling. Every change is **versioned**; responses bind to the instrument + scoring version they were captured under. Support a stable **core** instrument plus optional **rotating/diagnostic modules** and an **item bank** partners can draw from.

### 8.3 Distribution
Shareable link + **QR code** per campaign; optional embed. Works on a phone in a camp, a classroom, a church foyer. Tracks source/campaign without identifying the respondent.

### 8.4 Respondent experience
Mobile-first, friendly, **one question per screen**, progress indicator, branching from the screener, ~6 minutes, anonymous, fully translated. Warm welcome screen, thank-you screen. (Reference the respondent preview built into the pitch artifact — clean, single-accent, org-branded.)

### 8.5 Scoring engine
Implements §5. Computes per-session and aggregate scores; recomputable on scoring-version change; resilient to missing/low-n.

### 8.6 Organisation dashboard
For a single org. Must include:
- Overall **Index score** with YoY delta and vs-benchmark delta.
- **Dual lens:** by-question (3 domain scores) and by-tier (4 journey scores).
- **Journey bars** vs **national** and **global** benchmarks.
- **Per-question insight table:** item, org score, national score, gap, YoY.
- **Major shifts** since last year; **where you differ from the nation**; **suggested focus areas** (generated from gaps).
- **Trend over time** (Δ vs baseline across annual waves).
- Integrity note + sample size on every view.

### 8.7 Collab Intelligence (aggregate layer)
For the Collab/project team across all orgs. Must include:
- Headline counts (responses, orgs, countries, regions, languages).
- **Journey funnel** (global tier means + drop-offs).
- **3×4 questions×tiers heat-grid.**
- **Findings** (correlations once validated, e.g., formation→multiplication).
- **Top-quartile vs bottom-quartile** analysis.
- **Engaged-network vs public** comparison (public/control sample is a later funded phase).
- **Multiplication / scores by age band.**
- **The 11 regions** table (see §10).
- **Interactive tier map:** a nation-level view with a selector for each of the four tiers; nations coloured by score — **green** (strong, ≥58), **orange** (emerging, 42–57), **red** (early, <42), **grey** (no data). Current pitch uses a tile-grid cartogram; a true geographic choropleth ("Globe Tracker") is a planned v2.
- Feeds the annual flagship report, **"State of the Next Generation."**

### 8.8 Benchmarking service
Maintains country/region/global aggregates; enforces the **critical-mass gate** (§6); recomputes as data flows in.

### 8.9 Reports
- **Standard report** — free.
- **Advanced report** — paid (free for Collab members).
- Annual **flagship publication** tooling.

### 8.10 Tiers, roles & access control
- **Access tiers:** measures free → standard report free → advanced report paid (free for Collab members) → coaching/consulting paid.
- **Roles:** Respondent (anonymous) · Org Admin · Certified Facilitator · Collab Admin · Researcher/Instrument Admin · Super Admin. Row-level isolation per org.

### 8.11 Certified facilitators
Directory + tooling for trained facilitators who help orgs interpret results and plan action (the consulting layer). Track certification status; surface as a CTA from org dashboards ("talk to a facilitator about your multiplication gap").

### 8.12 Admin & data governance
Org management, consent records, data export/delete, audit logs, scoring/instrument version control.

---

## 9. Data model (entities & key fields)

- **Organisation** — id, name, logo, brand_colors, region, country, membership_tier (collab_member | external), consent_model, created_at.
- **Campaign / SurveyInstance** — id, org_id, instrument_version, scoring_version, language(s), white_label_config, source_label, active.
- **Item** — id, key, question_domain (follow|mission|world|screener|journey|demographic), tier (exposure|response|formation|multiplication|n/a), type, scale_config, reverse_scored, scored (bool), options[], order, instrument_version.
- **Translation** — item_id, locale, text, option_texts[].
- **Session** (respondent, anonymous) — id, campaign_id, age_band, gender, country, city (optional), consent_flags, locale, completed (bool), created_at. **No PII.**
- **Response** — session_id, item_id, raw_value, normalised_score (nullable for diagnostic), tier, question_domain.
- **Score** (derived) — scope (session|org|country|region|global), tier_scores{}, domain_scores{}, matrix{}, index_score, scoring_version, n, period.
- **Benchmark** — geography, period, aggregates, n, gate_passed (bool).
- **User** (admin/facilitator) — id, role, org_id (nullable), certification_status.
- **Report** — id, org_id, type (standard|advanced), period, artifact_ref.

---

## 10. The 11 NXT Move regions

Use these exact regions (canonical from nxtmove.global). Note: **Brazil is its own region**, separate from Latin America; **Europe is a single region** (no East/West split).

1. Africa
2. Brazil
3. Central Asia
4. East Asia
5. Europe
6. Latin America
7. Middle East & North Africa
8. North America
9. South Asia
10. South Pacific
11. Southeast Asia

Maintain a country → region mapping table. Region benchmarks follow the same critical-mass gate as countries.

---

## 11. Design system & UX direction

Target a **clean research-dashboard** aesthetic (reference points: Institute for Progress, Tony Blair Institute). The leadership pitch artifact (`Next_Gen_NGJFI_Leadership_Pitch.html`) is the canonical visual reference for tone, palette, and components.

**Palette (current):**
- Ink (text) `#22252b` · Page `#f5f6f8` · Cards `#ffffff` · Rules `#e2e5ea`
- Accent (coral) `#ff7a47` · Violet `#8b5cf6` · Green `#3f9d72` · Blue `#2f80c4`
- Map levels: green `#3f9d72` / orange `#e0993f` / red `#d65349` / grey `#e6e8ec`

**Type:** one clean sans across the UI — **Inter Tight** (display + body, hierarchy by weight/tracking) — with **JetBrains Mono** for small labels and data. No serif display.

**UX principles:** mobile-first respondent flow; progressive disclosure (simple by default, detail on demand); legible charts with distinguishable series; white-label cleanly overrides org-facing surfaces.

---

## 12. Suggested technical architecture (flexible — align with Eido)

Treat as a recommendation, not a mandate; the platform may run on Eido Research's existing shared-measurement infrastructure.

- **Frontend:** React + TypeScript (Next.js), Tailwind; charts via a lightweight lib or hand-built SVG; **i18next** for translation; mobile-first.
- **Backend:** typed API (Node/NestJS or Python/FastAPI); **PostgreSQL** (multi-tenant with row-level security); Redis for cached aggregates; object storage for logos/report artifacts.
- **Auth:** managed provider (e.g., Clerk/Auth0) or equivalent; role-based + org-scoped.
- **Scoring/aggregation:** background jobs; recomputable; versioned.
- **Infra:** cloud, IaC, environment isolation, automated backups.
- **i18n pipeline:** translation management for 14+ locales; RTL support.

---

## 13. Non-functional requirements

- **Privacy-first** (see §7) — non-negotiable.
- **Security** — encryption in transit/at rest, least privilege, audit logs, dependency hygiene.
- **Scale** — design for tens of thousands of responses across hundreds of orgs and dozens of countries; aggregates must stay fast (pre-compute/cache).
- **Performance** — respondent flow loads fast on low-end mobile and poor connectivity; consider offline-tolerant submission.
- **Accessibility** — WCAG AA; keyboard navigable; sufficient contrast; screen-reader labels.
- **Reliability & observability** — monitoring, error tracking, sensible logging (no PII in logs).
- **Localisation** — every respondent-facing string translatable; locale-aware formatting.

---

## 14. Build roadmap & budget envelope

Total programme budget **~$1M through 2033** (already represented to foundations — do not restate as lower). Indicative software-relevant phasing within that envelope:

| Phase | Year | Software focus | Indicative |
|---|---|---|---|
| Build & baseline | 2026 | Instrument config + scoring engine; respondent app MVP; single-org dashboard; DFW + Buenos Aires pilots | $120K |
| Prove the model | 2027 | White-label / multi-org; distribution (links/QR); benchmarking v1; infra hardening; key-country activation | $180K |
| Scale | 2028–29 | i18n/translation; Collab Intelligence dashboard; facilitator tooling; flagship-report tooling | $320K |
| Trend lines | 2030–31 | Dashboard v2; map/Globe Tracker; consulting layer; advanced reports | $240K |
| Standard | 2032–33 | Self-serve, polish, sustainability features | $140K |
| **Total** | **2026–33** | Full horizon | **~$1.0M** |

Early years are lean because crowdsourcing pushes gathering cost to partners; the tiered model bends later-year costs toward self-sustaining. Figures are realistic starting points, not a ceiling.

---

## 15. Ownership & governance

- **The Collab owns the project** and the relationships. **NXT Move** is the three-year backbone.
- **Eido Research** provides/operates the platform engine. **IP is co-owned** (NXT Move ↔ Eido contract).
- Participating organisations **own their own data**; aggregate participation is opt-in; published results credit both NXT Move and Eido.

---

## 16. Out of scope / explicitly deferred

- Public/"unengaged" control-sample collection (a later, funded phase).
- True geographic choropleth / "Globe Tracker" (v2 — start with the tile-grid map).
- Finalising the instrument wording and psychometric validation (researcher-owned; the platform must accommodate revision, not pre-empt it).
- Any centralised collection of identifiable minor data (never in scope).

---

## 17. Glossary

- **NGJFI / the Index** — the Next Gen Jesus-Following Index.
- **The 3 Questions** — Follow / Mission / World (what we measure).
- **The 4 Tiers** — Exposure / Response / Formation / Multiplication (how deep).
- **Gospel momentum** — movement through the four tiers.
- **Journey funnel** — the tier-to-tier drop-off (Exposure highest → Multiplication lowest).
- **White-label** — an org's branded instance of the Index.
- **Critical-mass gate** — minimum n before a geography's benchmark is shown.
- **Collab Intelligence** — the aggregate cross-org dashboard layer.
- **Certified facilitator** — a trained person who helps orgs act on results (consulting layer).
- **State of the Next Generation** — the planned annual flagship publication.

---

## 18. Guardrails for whoever builds this

1. **Don't lock the instrument.** Items, scales, tags, and scoring are versioned config — never hard-coded.
2. **Privacy is a feature, not a setting.** Anonymous by default; no central minor PII; edge consent.
3. **Never overclaim.** "Of those who completed the Index…" Benchmarks gated by critical mass.
4. **White-label means theirs.** Org-facing surfaces carry the org's brand; the Index stays in the footer.
5. **Both lenses, one instrument.** Always support reporting by the 3 questions *and* the 4 tiers.
6. **Keep the two core activities.** Weekly prayer and weekly scripture engagement must always be measurable.
7. **Clay, not a vase.** This is a starting brief. Flag assumptions, propose better, and expect the model to be shaped by the researchers and the Collab.
