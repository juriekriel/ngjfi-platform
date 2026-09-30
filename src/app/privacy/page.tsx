import LegalPage from "@/components/site/LegalPage";

export const metadata = {
  title: "Privacy — The Jesus Index",
  description: "What the Index stores about the people who answer it, and what it never stores. Draft for review.",
};

/**
 * DRAFT privacy notice. Every claim here must stay true of the code: if a
 * migration changes what is stored, change this page in the same PR.
 * Sources: 0001 (sessions: no PII), 0019 (approved metadata), 0020/0021
 * (gates), 0038 (test links), 0042 (redaction, under-13 exit, retention).
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      kicker="Privacy"
      title="What we keep, and what we never keep"
      updated="October 2026"
      sections={[
        {
          heading: "Who this is for",
          body: (
            <>
              <p>
                The Next Gen Jesus-Following Index (&ldquo;the Index&rdquo;) is a survey that churches and ministries run
                with young people aged 13 to 30, under their own name. This page explains what happens to the answers.
              </p>
              <p>
                It covers the people who answer the survey (&ldquo;respondents&rdquo;) and the staff of organisations who
                use the dashboard. The two are kept completely apart.
              </p>
            </>
          ),
        },
        {
          heading: "If you answer the survey",
          body: (
            <>
              <p>
                <b>We never ask for your name, email address or phone number.</b> We store your answers, your age group
                (never your birthday), the country you say you live in, and — only if you choose to give it — your city
                or area.
              </p>
              <p>
                We do not store your internet (IP) address with your answers. Like every website, the companies that
                host the Index (Netlify and Supabase) see it briefly to deliver the page, and keep it only in short-lived
                technical logs.
              </p>
              <p>
                If you type something in a free-text answer, email addresses, phone numbers, web addresses and
                social-media handles are removed automatically before it is saved. Please don&apos;t type your name or
                anyone else&apos;s.
              </p>
              <p>
                The survey is for people aged 13 and over. If you tell us you are 12 or younger, the survey ends straight
                away and nothing you chose is kept.
              </p>
              <p>
                If you lose signal, your answers wait on your phone and are sent when it reconnects, then deleted from the
                phone.
              </p>
            </>
          ),
        },
        {
          heading: "Who sees what",
          body: (
            <>
              <p>
                <b>The organisation that gave you the link only ever sees grouped results</b> — averages and counts across
                many people — never one person&apos;s answers. A group that is too small to hide an individual (fewer than
                ten people, by default) shows a count but no result.
              </p>
              <p>
                Results for a place are only shown once enough people there have taken part: at least 400 by default,
                and at least 2,000 before a whole country is named. We only ever describe &ldquo;those who have
                completed the Index&rdquo; — never a whole population.
              </p>
            </>
          ),
        },
        {
          heading: "Consent",
          body: (
            <p>
              Each organisation is responsible for getting the consent its context requires before sharing its link —
              including a parent&apos;s or guardian&apos;s consent for under-18s wherever that is required. Organisations
              confirm they have done this before their survey can accept answers. They keep their consent records
              themselves; the Index never holds them.
            </p>
          ),
        },
        {
          heading: "How long we keep answers",
          body: (
            <p>
              Anonymous answers are kept so that results can be recalculated when the method improves and compared year
              to year. A fixed retention period is being decided by the Collab&apos;s researchers; until it is, nothing is
              deleted automatically, and this page will be updated when it is.
            </p>
          ),
        },
        {
          heading: "If you run the dashboard",
          body: (
            <p>
              Organisation staff sign in with a work email address. We store that address, your name if you give it, your
              role, and a log of actions such as creating a survey link or confirming consent. We use it only to run the
              Index and to contact you about it.
            </p>
          ),
        },
        {
          heading: "Questions",
          body: (
            <p>
              Because answers are anonymous, we cannot find, show or delete one person&apos;s answers — there is nothing
              linking them to you. Questions about this page can go to the organisation that gave you the survey, or to
              the Next Gen Global Collab.
            </p>
          ),
        },
      ]}
    />
  );
}
