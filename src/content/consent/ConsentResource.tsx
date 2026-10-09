/**
 * "Consent: why it matters and how it works" — the single consent resource
 * (version 2026-10-v1). Rendered at /resources/consent and, in the
 * organisation's own branding, at /<org>/consent.
 *
 * Never a copy of anything that lives elsewhere:
 *   §0      ← src/content/consent/why-consent.ts (WHY_CONSENT)
 *   §5.1    ← CONSENT_STATEMENT (src/lib/consent.ts)
 *   §5.2    ← surveyConsentStatement() (src/lib/consent.ts)
 *   §6      ← src/data/consent-countries.json
 * so the page, the consent steps and the database can't drift apart.
 *
 * Sections carry data-print so "print the parent form only" and "print for
 * young people" can print one section (see globals.css, @media print).
 *
 * DRAFT — for review by counsel and the Collab before pilots.
 */
import { CONSENT_STATEMENT, CONSENT_STATEMENT_VERSION, SURVEY_CONSENT_STATEMENT_VERSION, surveyConsentStatement } from "@/lib/consent";
import { CONSENT_COUNTRIES, CARE_LABEL } from "@/lib/consentCountries";
import { CONSENT_DISCLAIMER, WHY_CONSENT, WHY_CONSENT_VERSION } from "@/content/consent/why-consent";

export const CONSENT_RESOURCE_VERSION = "2026-10-v1";

/** Who answers questions about consent, the Index or a respondent's data. */
export const PRIVACY_CONTACT_EMAIL = "ulrich@nxtmove.global";

const ADVICE = [
  ["China", "Surveys connected to an overseas organisation need a licensed local institution and project approval. Online religious content needs a permit.", "Survey consent is blocked until a local-advice reference is recorded"],
  ["Saudi Arabia", "Non-Muslims are banned from proselytising, and conversion from Islam is prohibited", "Blocked until a local-advice reference is recorded. Expatriate congregations only, if at all"],
  ["Pakistan", "Blasphemy laws, and documented violence against Christians", "Blocked until a local-advice reference is recorded. Free text strongly discouraged"],
  ["Egypt", "Contempt-of-religion law is actively enforced; sensitive data needs a licence", "Warning on the consent step; existing church communities only"],
  ["Vietnam", "Religious activity is state-registered, and online religious activity is under new rules", "Warning on the consent step; registered churches only"],
  ["Ethiopia", "Personal data must be stored in Ethiopia", "Warning on the consent step; allowed only because answers are anonymous"],
  ["Bangladesh", "Some data must stay in-country; the new law's status is still settling", "Warning on the consent step"],
] as const;

const SOURCES: [string, string][] = [
  ["DLA Piper, Data Protection Laws of the World (most countries)", "https://www.dlapiperdataprotection.com/"],
  ["FTC, COPPA FAQ", "https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions"],
  ["45 CFR 46 (Common Rule)", "https://www.hhs.gov/ohrp/regulations-and-policy/regulations/45-cfr-46/index.html"],
  ["OPC, PIPEDA in brief", "https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/"],
  ["Quebec Act P-39.1", "https://www.legisquebec.gouv.qc.ca/fr/document/lc/P-39.1"],
  ["TCPS 2 (2022)", "https://ethics.gc.ca/eng/policy-politique_tcps2-eptc2_2022.html"],
  ["ICO, special category data", "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data"],
  ["GDPR Art. 9", "https://gdpr-info.eu/art-9-gdpr/"],
  ["GDPR Recital 26", "https://gdpr-info.eu/recitals/no-26/"],
  ["CNIL, consent for under-15s", "https://cnil.fr/fr/recommandation-4-rechercher-le-consentement-dun-parent-pour-les-mineurs-de-moins-de-15-ans"],
  ["AZB & Partners, India's DPDP framework", "https://www.azbpartners.com/bank/update-indias-digital-personal-data-protection-framework-comes-into-effect/"],
  ["Bird & Bird, South Africa", "https://childreninthedigitalworld.twobirds.com/home/south-africa"],
  ["UUBO, Nigeria: personal data of a minor", "https://uubo.org/document/personal-data-of-a-minor-what-you-must-know"],
  ["PIPL (official translation)", "http://en.npc.gov.cn.cdurl.cn/2021-12/29/c_694559.htm"],
  ["China: foreign-related investigation measures", "https://appinchina.co/government-documents/measures-for-the-administration-of-foreign-related-investigation/"],
  ["DFDL, Indonesia PP 17/2025", "https://www.dfdl.com/insights/legal-and-tax-updates/indonesia-new-regulation-sets-ground-rules-for-child-safety-in-online-platforms-pp-no-17-2025/"],
  ["VietNamNet, religious activity rules", "https://vietnamnet.vn/en/vietnam-reviews-detailed-rules-on-belief-and-religious-activities-2540180.html"],
  ["CONEP Ofício-Circular 17/2022 (Brazil)", "https://www.gov.br/hubrasil/pt-br/hospitais-universitarios/regiao-nordeste/hulw-ufpb/ensino-e-pesquisa/residencias/oficiocircular17_2022.pdf"],
  ["Bird & Bird, Brazil", "https://childreninthedigitalworld.twobirds.com/home/brazil"],
  ["Garrigues, Mexico's 2025 LFPDPPP", "https://www.garrigues.com/es_ES/noticia/mexico-nueva-ley-federal-proteccion-datos-personales-posesion-particulares-introduce"],
  ["Al Tamimi, Egypt's Executive Regulations", "https://www.tamimi.com/news/from-policy-to-practice-egypt-issues-executive-regulations-of-the-personal-data-protection-law"],
  ["National Bioethics Committee, Pakistan", "https://nbcpakistan.org.pk/nbc-r.html"],
  ["USCIRF 2026, Pakistan", "https://www.uscirf.gov/sites/default/files/2026-03/USCIRF%202026%20Annual%20Report%20Pakistan.pdf"],
  ["The Business Standard, Bangladesh ordinances", "https://www.tbsnews.net/bangladesh/govt-issues-gazettes-2-landmark-ordinances-data-protection-governance-1281356"],
  ["Securiti, Bangladesh 2026 Act", "https://securiti.ai/bangladesh-personal-data-protection-act-overview/"],
  ["Ethiopia Proclamation 1321/2024 (full text)", "https://www.metaappz.com/References/ethiopian_laws/federal/pr_1321_2024/en/txt"],
  ["Bowmans, parental consent in East Africa", "https://bowmanslaw.com/insights/kenya-and-tanzania-comparative-analysis-on-parental-consent-under-east-african-privacy-laws/"],
];

/**
 * Print-only letterhead: the accent bar, the name, and the Index line. On
 * screen it is hidden (globals.css, .print-brand). The accent comes from
 * --print-accent on the resource wrapper — coral on /resources/consent, the
 * organisation's own colour on /<org>/consent (white-label, non-negotiable #4).
 */
function PrintBrand({ org }: { org?: string }) {
  return (
    <div className="print-brand" aria-hidden>
      <div className="print-brand-bar" />
      <div className="print-brand-row">
        {org ? (
          <span className="print-brand-name">{org}</span>
        ) : (
          <span className="print-brand-name">
            The <i>Jesus</i> <span className="print-brand-index">Index</span>
          </span>
        )}
        <span className="print-brand-meta">
          {org ? "Jesus-Following Index · jfindx.org" : "A global measure of Jesus-following · jfindx.org"}
        </span>
      </div>
    </div>
  );
}

function Sec({ id, title, print, org, children }: { id: string; title: string; print?: string; org?: string; children: React.ReactNode }) {
  return (
    <section id={id} data-print={print} className="consent-section mt-8 border-t border-rule pt-6">
      {/* Handouts carry their own branded header so a single printed page stands on its own. */}
      {print && <PrintBrand org={org} />}
      <h2 className="text-[20px] font-bold tracking-tight">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-[15.5px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

function T({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-[13.5px] leading-snug">
        <thead>
          <tr>{head.map((h) => <th key={h} className="border-b border-rule-2 px-2 py-1.5 text-left font-semibold text-ink">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => <td key={j} className="border-b border-rule px-2 py-1.5">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The org's name where one is given (white-label), else a blank to fill in. */
export default function ConsentResource({ orgName, accent = "#ff7a47" }: { orgName?: string; accent?: string }) {
  const org = orgName ?? "[Organisation name]";
  return (
    <div className="consent-resource" style={{ ["--print-accent" as string]: accent } as React.CSSProperties}>
      <PrintBrand org={orgName} />
      <p className="text-[16px] leading-relaxed text-ink-2">
        <b className="text-ink">For organisations running the Jesus-Following Index with young people aged 13–30.</b>{" "}
        No young person answers the Index unless someone responsible has said yes first. This resource explains why, how
        consent works on the platform, what the rules look like in {CONSENT_COUNTRIES.length} countries, and gives you
        the materials to do it well.
      </p>
      <p role="note" className="consent-callout mt-4 rounded-xl border border-emerald/50 bg-emerald/10 px-4 py-3 text-[13.5px] leading-relaxed text-ink">
        <b className="text-ink">This is a reference, not legal advice.</b> See the disclaimer at the end.
      </p>

      <Sec id="why" title="0 · Why consent?">
        <WhyConsentBlock />
        <p className="text-[12.5px] text-muted">This text appears with every consent request on the platform · version {WHY_CONSENT_VERSION}</p>
      </Sec>

      <Sec id="glance" title="1 · At a glance">
        <T head={["", ""]} rows={[
          [<b key="a">Who takes part</b>, "Young people aged 13–30. Under-13s are stopped at the first question and nothing is kept. A survey consented for 18+ only also stops anyone who picks 13–17."],
          [<b key="b">How long it takes</b>, "About 6 minutes (5 for the J12-only version), plus about 2 optional minutes."],
          [<b key="c">What's collected</b>, "Answers, age group, gender (optional), country, city or area (optional), language, and when they answered. Never names, emails, phone numbers, birthdays or IP addresses."],
          [<b key="d">Who sees what</b>, "You see grouped results only, never one person's answers. Groups smaller than 10 show a count but no score."],
          [<b key="e">How long answers are kept</b>, "Full answers for 60 days, for quality checks. After that the exact time, the city, typed answers and the room-level link are removed. The cleaned answers are kept for up to 5 years, then only grouped totals remain."],
          [<b key="f">Who holds consent records</b>, "You do. Keep them yourself and never send them to the Index."],
        ]} />
      </Sec>

      <Sec id="how" title="2 · How consent works on the Index">
        <p>Consent is confirmed <b>twice</b>. A survey link records nothing until both are in place.</p>
        <T head={["Level", "When", "Who confirms", "What they confirm"]} rows={[
          [<b key="1">1. Your organisation</b>, "Once, and again whenever the statement changes", "An organisation admin", "The organisation statement (5.1)"],
          [<b key="2">2. Each survey you send</b>, "Before every link or QR code goes out", "An organisation admin", "The survey statement (5.2): the countries it runs in, the age groups invited, how parental consent was gathered, any ethics approval and any local legal advice"],
        ]} />
        <ul className="list-disc pl-5">
          <li><b>No consent, no participation.</b> A link without both confirmations shows young people a polite “This survey isn't open yet” screen and records nothing. Test links still work, and record only to test data.</li>
          <li><b>You can't send what isn't consented.</b> A new survey link shows its URL and QR code only after its consent step.</li>
          <li><b>Visible to the Index administrators.</b> A consent register shows every organisation and every survey: consented or not, for what, by whom and when, with the full history. It holds staff names and dates only, never anything about a young person.</li>
        </ul>
      </Sec>

      <Sec id="under-18" title="3 · What makes research with under-18s different">
        <p>Research with young people under 18 adds six layers of care. The details differ by country, so there&apos;s no single standard.</p>
        <T head={["Layer", "What it asks of us"]} rows={[
          [<b key="1">Ethical review</b>, "Often a review board or equivalent before the study starts. For a church-run, non-academic survey this is usually best practice rather than law, but it becomes required where a university, public funding or publication is involved."],
          [<b key="2">Parental or guardian consent</b>, "Active and verifiable, not assumed. Often it must be in place before the young person even sees the survey."],
          [<b key="3">The young person's own agreement</b>, "Plain language a 13-year-old understands: what it is, and that it's voluntary."],
          [<b key="4">Data protection</b>, "Stricter rules for children's data, and in some countries limits on sending it abroad."],
          [<b key="5">Recruitment</b>, "Going through churches and youth organisations that already hold consent structures, not social-media ads aimed at minors."],
          [<b key="6">Safeguarding</b>, "A plan for sensitive answers, support for anyone distressed, and knowing local reporting duties."],
        ]} />
        <p>One practical consequence: <b>there&apos;s no compliant way to recruit 13-year-olds directly through social media at scale.</b> Consent has to come through people and organisations who already know the young person.</p>
        <p><b>That&apos;s how the Index works.</b> The survey reaches young people only through churches and ministries that know them, and those organisations gather consent locally. It never reaches young people through open social-media recruitment. That&apos;s why both levels of consent are required, and why a survey can&apos;t run without them.</p>
      </Sec>

      <Sec id="responsibilities" title="4 · Your responsibilities">
        <p>Confirming consent means you have done the following:</p>
        <ol className="list-decimal pl-5">
          <li><b>Checked what your context requires</b>: your country&apos;s law (section 6), your denomination&apos;s policy and your own safeguarding policy. Where any of them requires a parent&apos;s or guardian&apos;s consent for 13–17-year-olds, you have it before they take part.</li>
          <li><b>Shared links only with the age groups you confirmed</b>, and never with anyone under 13.</li>
          <li><b>Made taking part voluntary.</b> No one is rewarded for taking part or penalised for not taking part. Anyone can skip questions or stop at any time.</li>
          <li><b>Given people privacy while they answer.</b> Let them use their own phone, or a space where no one can see their screen. Leaders don&apos;t look over shoulders or ask anyone what they answered.</li>
          <li><b>Kept your own records.</b> Store consent forms and attendance lists securely, in line with your safeguarding policy. Never upload them to the Index or link them to survey answers.</li>
          <li><b>Prepared for disclosures.</b> If a young person raises something that concerns you, follow your safeguarding policy as you would anywhere else. The survey itself is anonymous and can&apos;t be used to follow anyone up.</li>
        </ol>
      </Sec>

      <Sec id="statements" title="5 · The statements you confirm">
        <h3 className="text-[16px] font-semibold text-ink">5.1 Your organisation · version {CONSENT_STATEMENT_VERSION}</h3>
        <ul className="list-disc rounded-lg border border-rule bg-paper-deep py-3 pl-8 pr-4 text-[14.5px]">
          {CONSENT_STATEMENT.map((l) => <li key={l}>{l}</li>)}
        </ul>
        <h3 className="text-[16px] font-semibold text-ink">5.2 Each survey you send · version {SURVEY_CONSENT_STATEMENT_VERSION}</h3>
        <ul className="list-disc rounded-lg border border-rule bg-paper-deep py-3 pl-8 pr-4 text-[14.5px]">
          {surveyConsentStatement({ countries: [], ageBands: [], method: null }).map((l) => <li key={l}>{l}</li>)}
        </ul>
        <p className="text-[14px]">☐ I&apos;ve read “Why consent?” and confirm the above for this survey.</p>
        <p>If either statement changes, its version number changes and the platform asks you to confirm again. An existing survey keeps collecting for 14 days after a change, then pauses until it&apos;s reconfirmed.</p>
      </Sec>

      <Sec id="countries" title="6 · Country reference">
        <p>The table covers {CONSENT_COUNTRIES.length} countries, including the countries where pilots run first. Requiring a parent&apos;s or guardian&apos;s consent for <b>every 13–17-year-old</b> meets or exceeds every country&apos;s minimum age in the table.</p>
        <p>Truly anonymous data falls outside nearly every law below. The rules apply in full if answers can identify someone, for example through a small town combined with age band and gender. That&apos;s why the Index removes those details after 60 days.</p>
        <T head={["Country", "Main law (regulator)", "Parent/guardian consent needed under", "Faith answers sensitive?", "Ethics review for a church-run survey", "Storing data abroad (US/EU)", "Level of care"]}
           rows={CONSENT_COUNTRIES.map((c) => [<b key={c.country_code}>{c.country}</b>, c.main_law, c.parental_consent_note, c.faith_data, c.ethics_review, c.data_abroad,
             <span key="s"><span className="block font-semibold text-ink">{CARE_LABEL[c.care_level]}</span>{c.summary}</span>])} />
        <p className="text-[13.5px]">“Best practice” means we found no legal requirement for a non-academic, church-run survey. It becomes required if a university, public research funding or academic publication is involved.</p>
        <h3 className="text-[16px] font-semibold text-ink">6.1 Countries that need local advice before launch</h3>
        <p>In these seven countries the risk is to the young people themselves, not only a compliance question. Don&apos;t open a survey there without local legal advice and a named local partner.</p>
        <T head={["Country", "Main concern", "On the platform"]} rows={ADVICE.map(([a, b, c]) => [<b key={a}>{a}</b>, b, c])} />
      </Sec>

      <Sec id="young-people" org={orgName} title="7 · Information for young people" print="young-people">
        <p className="text-[13.5px] italic">You can hand this out, project it, or read it aloud.</p>
        <p><b className="text-ink">What is this?</b><br />It&apos;s a short survey about faith: what you believe, how you live it out, and what helps or gets in the way. {org} is one of many churches and ministries around the world using it to understand how they can serve young people better.</p>
        <p><b className="text-ink">Do I have to do it?</b><br />No. It&apos;s your choice. You can skip any question, choose “Prefer not to say”, or stop at any time. Nothing happens if you don&apos;t take part.</p>
        <p><b className="text-ink">Is it anonymous?</b><br />Yes. We never ask for your name, email, phone number or birthday. Nobody at {org}, including your leaders, can see your answers. They only see results grouped across many people.</p>
        <p><b className="text-ink">What happens to my answers?</b><br />They&apos;re stored securely. After 60 days, anything that could help point to you is removed, such as the exact time you answered or the words you typed yourself. The rest is kept for up to 5 years to improve the survey, then only group totals are kept.</p>
        <p><b className="text-ink">What if a question is hard?</b><br />Some questions are personal. Answer honestly if you can, or skip it. If anything brings up something you&apos;d like to talk about, [named leader / safeguarding contact] is available.</p>
        <p><b className="text-ink">Questions?</b><br />Ask [named leader], or read the full privacy notice at jfindx.org/privacy.</p>
      </Sec>

      <Sec id="parents" org={orgName} title="8 · Information and consent form for parents and guardians" print="parents">
        <p className="text-[13.5px] italic">For 13–17-year-olds wherever your law, denomination or safeguarding policy requires a parent&apos;s or guardian&apos;s consent. Print it on your own letterhead. Keep signed forms yourself. Do not send them to the Index.</p>
        <p><b className="text-ink">Dear parent or guardian,</b></p>
        <p>On <b>[date]</b> at <b>[event / group]</b>, {org} will invite young people to take part in the <b>Jesus-Following Index</b>. It&apos;s a short anonymous survey, about 6 minutes, used by churches and ministries around the world to understand young people&apos;s faith and what helps it grow.</p>
        <p><b className="text-ink">What your child will be asked:</b> questions about what they believe, how they practise their faith, how they relate to others, and what has shaped them. A few questions ask about their age group, gender, and country and city. All of these can be skipped.</p>
        <p><b className="text-ink">What is not collected:</b> their name, email, phone number, date of birth, photo or IP address. Answers can&apos;t be traced back to your child, and {org} sees grouped results only.</p>
        <p><b className="text-ink">How long answers are kept:</b> full answers for 60 days. After that, details that could point to a person are removed, and the cleaned answers are kept for up to 5 years for research. After that, only grouped totals remain.</p>
        <p><b className="text-ink">Taking part is voluntary.</b> Your child can skip any question or stop at any time, and saying no has no consequences.</p>
        <p>Questions? Contact <b>[name, role, phone/email]</b>. The full privacy notice is at jfindx.org/privacy.</p>
        <div className="mt-2 rounded-lg border-2 border-dashed border-rule-2 p-4 text-ink">
          <p className="font-semibold">Consent <span className="font-normal italic text-ink-2">(return to {org}; kept by us, never shared with the Index)</span></p>
          <p className="mt-3">Young person&apos;s first name: ______________________ &nbsp; Group: ______________________</p>
          <p className="mt-3">☐ I agree to my child taking part in the Jesus-Following Index survey.<br />☐ I do not agree to my child taking part.</p>
          <p className="mt-3">Parent/guardian name: ______________________</p>
          <p className="mt-3">Signature: ______________________ &nbsp; Date: ____________</p>
        </div>
      </Sec>

      <Sec id="script" org={orgName} title="9 · Script to read before the survey" print="script">
        <p className="text-[13.5px] italic">About 60 seconds. Read it, or say it in your own words, before sharing the link or QR code.</p>
        <blockquote className="border-l-2 border-emerald pl-4 text-ink">
          <p>“We&apos;re going to give you the chance to take a short survey. It takes about six minutes, and it&apos;s about faith: what you believe and how you live it out. It&apos;s anonymous. There are no names, and none of us will ever see your answers. We only see results grouped across lots of people.</p>
          <p className="mt-2">It&apos;s completely your choice. You can skip any question or stop at any time, and that&apos;s fine. If you&apos;re under 13, please don&apos;t take it.</p>
          <p className="mt-2">Find a spot where no one can see your screen. If anything in it brings something up for you, come and find [name] afterwards.</p>
          <p className="mt-2">Thank you. Your honest answers help us, and churches around the world, serve young people better.”</p>
        </blockquote>
      </Sec>

      <Sec id="checklist" title="10 · Checklist for the day">
        <ul className="flex flex-col gap-1">
          {[
            "Your organisation's consent is confirmed on the platform (Survey settings → Consent).",
            "This survey's consent is confirmed: countries, age groups, parental-consent method, and local advice where required.",
            "Parent/guardian forms collected where required, and stored by you.",
            "Link or QR code tested with a test link first.",
            "A named leader is available for anyone who wants to talk afterwards.",
            "Young people can answer privately.",
            "The script has been read.",
          ].map((x) => <li key={x}>☐ {x}</li>)}
        </ul>
      </Sec>

      <Sec id="disclaimer" title="11 · Disclaimer and contact">
        <p className="consent-callout rounded-xl border border-emerald/50 bg-emerald/10 px-4 py-3 text-[14px] text-ink"><b className="text-ink">{CONSENT_DISCLAIMER.split(".")[0]}.</b>{CONSENT_DISCLAIMER.slice(CONSENT_DISCLAIMER.indexOf(".") + 1)}</p>
        <p>Questions about consent, the Index or your data: <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="font-semibold text-ink underline decoration-emerald underline-offset-2">{PRIVACY_CONTACT_EMAIL}</a>. Full privacy notice: jfindx.org/privacy · Terms for organisations: jfindx.org/terms</p>
      </Sec>

      <Sec id="sources" title="Sources">
        <ul className="list-disc pl-5 text-[13.5px]">
          <li>“Addressing the Under-18 Research Gap” (internal scoping paper)</li>
          {SOURCES.map(([label, href]) => (
            <li key={href}><a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-rule-2 underline-offset-2">{label}</a></li>
          ))}
        </ul>
        <p className="text-[12px] text-muted">Resource version {CONSENT_RESOURCE_VERSION} · country reference {CONSENT_COUNTRIES[0]?.reference_version}</p>
      </Sec>
    </div>
  );
}

/** §0 — also shown on every consent request (org card and survey step). */
export function WhyConsentBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-rule bg-paper-deep px-4 py-3 ${compact ? "text-[13.5px]" : "text-[15px]"} leading-relaxed text-ink-2`}>
      <p className="font-semibold text-ink">{WHY_CONSENT.title}</p>
      <p className="mt-1.5">{WHY_CONSENT.intro}</p>
      <ul className="mt-1.5 list-disc pl-5">
        {WHY_CONSENT.points.map((p) => <li key={p.strong}><b className="text-ink">{p.strong}</b>{p.rest}</li>)}
      </ul>
      <p className="mt-1.5">{WHY_CONSENT.local}</p>
      <p className="mt-1.5 font-semibold text-ink">{WHY_CONSENT.rule}</p>
      <p className="mt-1.5">{WHY_CONSENT.countries}</p>
    </div>
  );
}
