/**
 * How the Index came to exist — the record, as content not markup.
 *
 * Kept as data so the story can be re-ordered, translated, or rendered
 * differently (timeline, ledger, print) without rewriting a page. Compiled from
 * the Collab working documents, the meeting notes, the May 2026 Operational
 * Progress Report and the August 2026 build sessions.
 */

export interface Beat {
  when: string;
  title: string;
  body: string;
  /** The thing that changed because of this beat. */
  consequence?: string;
}

export interface Era {
  id: string;
  ordinal: string;
  window: string;
  title: string;
  standfirst: string;
  beats: Beat[];
  /** A number worth setting large in the margin. */
  marker?: { figure: string; caption: string };
}

export const ERAS: Era[] = [
  {
    id: "question",
    ordinal: "I",
    window: "late 2024 → Jan 2025",
    title: "The question nobody could answer",
    standfirst:
      "A coalition of thirty-plus organisations adopted one goal — everyone in the next generation with a real opportunity to follow Jesus by 2033. A goal that size needs a scoreboard. There wasn't one.",
    marker: { figure: "2033", caption: "the first milestone, not the finish line" },
    beats: [
      {
        when: "The framing",
        title: "What do young people believe about Jesus — and what does that tell us to do?",
        body: "The Research & Measurement work group set the leading question, and named two purposes it had to serve: progress (are we actually moving?) and funding (unlock resources against evidence, not anecdote).",
      },
      {
        when: "The model",
        title: "Three questions, and the 4+2 framework",
        body: "Do they follow Jesus? Do they participate in His mission? Does their world look different because of Him? Underneath the first sat the four beliefs — God exists, Jesus is the Son of God, forgiveness through Jesus, the Bible is God's word — and the two activities: pray weekly, read scripture weekly.",
        consequence: "The three questions have survived every subsequent revision, including a total change of business model.",
      },
      {
        when: "The constraint",
        title: "One question is best. Twelve can be done. Twenty is the maximum.",
        body: "Set early and defended since. A long instrument is an unfinished instrument — in a camp queue, on a borrowed phone, the length of the survey is the study's real sampling method.",
      },
    ],
  },
  {
    id: "drafting",
    ordinal: "II",
    window: "Feb → May 2025",
    title: "Drafting — and the pushback that improved it",
    standfirst:
      "A tight run of working sessions sharpened the instrument. The most useful sessions were the ones where the Collab argued with it.",
    marker: { figure: "2", caption: "contrasting pilot cities, chosen deliberately" },
    beats: [
      {
        when: "March 2025",
        title: "Two cities, chosen to disagree with each other",
        body: "Dallas–Fort Worth (influenced audience, English, seminary researchers) and Buenos Aires (uninfluenced, Spanish, and the 2027 showcase host). Contrasting on purpose, so translation and cross-cultural fit break early while they are still cheap to fix.",
      },
      {
        when: "April 2025",
        title: "The theology got audited, in public",
        body: "Debbie Bresina warned that “claiming Jesus is Lord” risks importing works-based theology. Monika Kuschmierz flagged double-barrelled items. Dave Corryell asked for an open “who do you believe Jesus is?” before the leading questions. John Yip pressed for a reproductive-discipleship item — 2 Timothy 2:2 — are you mentoring someone else?",
        consequence: "All four landed in the instrument. The mentoring item is now the only thing measuring multiplication in personal faith.",
      },
      {
        when: "April 2025",
        title: "OneHope's reality check",
        body: "Screen out under-18s or handle consent properly. Use panel companies. Expect $8–$13 per completed response. Build in attention checks. And the warning that mattered most: your questions may be too leading, and your influenced audience knows what you want to hear.",
        consequence: "Reverse-scored items and an attention check are in the instrument because of this conversation.",
      },
      {
        when: "The DFW pilot",
        title: "The first real finding — and it was a gap",
        body: "Among under-30s: 93% identified as followers of Jesus and 97% affirmed Jesus as the Son of God. 64% prayed daily — but only 26% read the Bible daily. Only 36% attended church weekly. 48% were being mentored; only 34% were mentoring anyone.",
        consequence: "The mentorship deficit and the prayer/scripture gap became the project's founding evidence that the instrument could surface something actionable.",
      },
    ],
  },
  {
    id: "wall",
    ordinal: "III",
    window: "2025 → early 2026",
    title: "The wall",
    standfirst:
      "The original plan was a centralised, seven-year, fifty-country study of under-30s, run annually against 200,000 respondents. Three constraints killed it — and it is worth being precise about which, because the pivot only makes sense against them.",
    marker: { figure: "$43M", caption: "what a comparable 22-country study actually cost" },
    beats: [
      {
        when: "Ethics",
        title: "You cannot centrally collect data on minors across fifty countries",
        body: "Research Director Dr. Matthew Niermann's institutional oversight prohibits endorsing a report built on partner-collected raw data for minors. Doing it properly would require multi-country IRB infrastructure the Collab does not have and cannot buy.",
      },
      {
        when: "Money",
        title: "The arithmetic never worked",
        body: "The nominal $1M budget cannot buy a scientifically valid fifty-country longitudinal study. Harvard's Human Flourishing study, across twenty-two countries, ran at $43M.",
      },
      {
        when: "Method",
        title: "Forcing it would have destroyed the thing it was for",
        body: "A global study on an inadequate budget means snowball sampling and systematic selection bias — which wrecks comparability across years and regions. Comparability was the entire point. OneHope's research team signalled real hesitancy about the model.",
        consequence: "The honest conclusion: the study as designed could not be done well, and doing it badly was worse than not doing it.",
      },
    ],
  },
  {
    id: "pivot",
    ordinal: "IV",
    window: "May 2026",
    title: "The pivot — from research project to shared standard",
    standfirst:
      "Stop being an expensive data-gathering entity. Become the backbone organisation that manages a global metric standard — and give the measure away.",
    marker: { figure: "$350K", caption: "what the standard costs, against millions for the study" },
    beats: [
      {
        when: "The precedent",
        title: "Gallup's Q12",
        body: "Give the measure away, let everyone benchmark against it, and build intelligence and consulting on top. Framed inside Stanford's Collective Impact model, the Index supplies the “shared measurement” condition the coalition was missing.",
      },
      {
        when: "The economics",
        title: "Everything gets easier at once",
        body: "Cost falls from millions to roughly $350K. Regulatory liability moves to the partners who already hold the parental-consent relationships. And funders get something fundable: a platform, a training pipeline and a publication — not an open-ended field-research cheque.",
      },
      {
        when: "The instrument",
        title: "The J12, sequenced as a discipleship pyramid",
        body: "A memorable twelve-item core, engineered for translation across fifty countries, ordered Exposure → Response → Formation → Multiplication, because formation is sequential. Crossed with the original three questions, that gives the 3 × 4 matrix that now drives the schema, the scoring and every figure on this site.",
        consequence: "The narrowing across tiers is the journey funnel. The combined movement is what the Collab calls gospel momentum.",
      },
      {
        when: "The assets",
        title: "Three things, not one",
        body: "The dashboard every organisation reads its own results in. A pipeline of certified facilitators — two hundred by 2029, reaching a hundred thousand young people. And an annual anchor publication: State of Jesus Following in the Next Generation, first edition 2028.",
      },
    ],
  },
  {
    id: "scale",
    ordinal: "V",
    window: "May 2026",
    title: "Who actually carries it",
    standfirst:
      "In parallel the operational base grew from three pilot organisations to ten committed Year-1 partners, each with a named executive lead.",
    marker: { figure: "±4.4%", caption: "target regional margin of error, at n = 400–500" },
    beats: [
      {
        when: "The partners",
        title: "Ten organisations, named and committed",
        body: "NXT Move · Word of Life · KDEC/GKPN · OneHope · Global Children's Forum · Convoy of Hope · Dare2Share · Cru · World Evangelical Alliance · Youth for Christ / YouthCompass.",
      },
      {
        when: "The infrastructure",
        title: "Research direction, technical partner, operational engine",
        body: "Dr. Matthew Niermann as Research Director. Eido Research as technical partner — 100+ faith-based organisations and 500,000+ respondents processed. The Institute for Great Commission Research at CBU as operational engine. Ulrich Lombard as Collaboration Research Coordinator, the day-to-day bridge.",
      },
      {
        when: "The method",
        title: "Two avenues, and a designed-out bias",
        body: "An influenced network channel plus an uninfluenced professional panel, targeting 400–500 responses per region for a ±4.4–4.9% regional margin of error. Collection runs through partners' own camps, conferences and church networks across eleven regions rather than external academic surveyors — which is also how the historic Western bias in youth research gets designed out.",
      },
    ],
  },
  {
    id: "now",
    ordinal: "VI",
    window: "August 2026",
    title: "From pitch to working platform",
    standfirst:
      "The leadership pitch was a static, hardcoded mock-up. In a run of build sessions it became a real, multi-tenant, data-driven platform — the one this site is rendered by.",
    marker: { figure: "12 / 12", caption: "matrix cells now populated, after v1" },
    beats: [
      {
        when: "The decisions",
        title: "Public repo, versioned schema, anonymous respondents",
        body: "Next.js and TypeScript on Netlify, Supabase for Postgres, row-level security and auth. Database schema lives as versioned migrations in the repo, never hand-edited. White-labelling is path-based. Respondents are anonymous with no account; organisation admins are verified by matching their email domain to their website.",
      },
      {
        when: "What works",
        title: "The whole loop, end to end",
        body: "The respondent survey in English and Spanish, one question per screen, white-labelled. The organisation dashboard with index score, journey funnel, both lenses, the 3 × 4 matrix and annual trend — aggregates only. Collab Intelligence across every organisation. A scoring engine with a SQL mirror so the database and the app can never disagree.",
      },
      {
        when: "Instrument v1",
        title: "The audit, and what it found",
        body: "A review of the fielded survey found four of the twelve matrix cells empty — the whole Exposure row, plus Follow × Multiplication. Two of the four beliefs were missing outright; the Bible was measured only inversely; the follower item was double-barrelled; and the mentoring item raised in April 2025 was not actually there. The survey also asked every question of everyone, including people who had just said they were confident God does not exist.",
        consequence: "v1 fills all twelve cells, states the four beliefs as four separate claims, restores reproductive discipleship, and adapts — someone who has never heard the story now answers five questions instead of twenty-five.",
      },
    ],
  },
];

/** Decisions still genuinely open. Publishing them is the point. */
export const OPEN_QUESTIONS: { q: string; why: string }[] = [
  {
    q: "How do you measure multiplication without self-report inflation?",
    why: "People reliably over-report sharing their faith. Multiplication is the tier the whole strategy turns on, and it is the one most vulnerable to flattering answers.",
  },
  {
    q: "Where exactly should the critical-mass gate sit?",
    why: "No benchmark is published for a geography until enough people there have completed the Index. The working number is a placeholder, not a finding — and it decides when countries start seeing themselves.",
  },
  {
    q: "Do a 13-year-old and a 29-year-old belong on the same instrument?",
    why: "The platform is built to survive age-specific versions. The research has not settled whether it needs them.",
  },
  {
    q: "Should a skipped question count as zero, or as not-asked?",
    why: "Now that the survey adapts, Formation and Multiplication describe the people who reached those tiers rather than the whole sample. That makes the funnel honest per-item and harder to compare between organisations. Currently: not-asked.",
  },
  {
    q: "The Index starts at 13–30 — which cohort comes second?",
    why: "The nameplate was chosen so it never has to change. Editions carry the cohort; the subject never moves.",
  },
];

/** Named, so the name can outlive its first cohort. */
export const NAMING: { layer: string; name: string; role: string }[] = [
  { layer: "Masterbrand", name: "The Jesus Index", role: "The standard itself. No generation in the name — editions carry the cohort." },
  { layer: "Ticker", name: "JX", role: "JX:NG for NextGen today; JX:DFW and JX:BA for city waves; JX:ALL after 2033." },
  { layer: "Instrument", name: "the J12", role: "The twelve-item core. Twelve was already sacred arithmetic — it inherits the disciples, not a demographic." },
  { layer: "Address", name: "jfindx.org", role: "Reads J·F·INDX — Jesus-Following Index." },
  { layer: "Publication", name: "State of Jesus Following in the Next Generation", role: "Vol. I, 2028. A series template: the cohort slides, the subject never moves." },
];
