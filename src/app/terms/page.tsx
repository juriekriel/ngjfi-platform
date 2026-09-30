import LegalPage from "@/components/site/LegalPage";

export const metadata = {
  title: "Terms for organisations — The Jesus Index",
  description: "What an organisation agrees to when it runs the Index. Draft for review.",
};

/** DRAFT terms for participating organisations — pending counsel and the Collab. */
export default function TermsPage() {
  return (
    <LegalPage
      kicker="Terms for organisations"
      title="Running the Index as your own"
      updated="October 2026"
      sections={[
        {
          heading: "What you get",
          body: (
            <p>
              The Index is free to run. You get the survey under your own name and colours, your own dashboard of grouped
              results, and — once enough organisations near you take part — a comparison with your country and the
              world.
            </p>
          ),
        },
        {
          heading: "What you agree to",
          body: (
            <>
              <p>
                <b>Consent.</b> You will obtain the consent your context requires before anyone takes your survey,
                including parental or guardian consent for 13-to-17-year-olds wherever your law, denomination or
                safeguarding policy requires it. You keep those records; you will not send them to the Index.
              </p>
              <p>
                <b>Age.</b> You will only share your links with people aged 13 or over.
              </p>
              <p>
                <b>No identification.</b> You will not try to work out who gave any answer, and you will not ask
                respondents to put identifying information into the survey.
              </p>
              <p>
                <b>Honest reporting.</b> When you share results, you will describe them as results &ldquo;of those who
                completed the Index&rdquo;, not as a finding about everyone in your community, church or country.
              </p>
            </>
          ),
        },
        {
          heading: "The shared picture",
          body: (
            <p>
              Anonymous answers from every participating organisation are pooled so that everyone can see the same
              picture. The public picture never names an organisation, and nothing is shown for a place until enough
              people there have taken part. No organisation is ever ranked against another.
            </p>
          ),
        },
        {
          heading: "The instrument",
          body: (
            <p>
              The questions are stewarded by the Collab&apos;s researchers and will change as the method improves. Every
              answer stays tied to the version it was given under, so results can always be recalculated fairly.
            </p>
          ),
        },
        {
          heading: "Removing answers",
          body: (
            <p>
              Organisations cannot delete their own responses — if they could, the shared picture would stop being
              trustworthy. If answers were collected in error (for example, a link shared with the wrong group), ask the
              Collab and an administrator will remove them, with the reason recorded.
            </p>
          ),
        },
        {
          heading: "Who runs it",
          body: (
            <p>
              The Index is run for the Next Gen Global Collab by its backbone organisation. Who acts as controller of the
              pooled data, and under which law, is being settled with counsel and will be stated here before pilots
              begin.
            </p>
          ),
        },
      ]}
    />
  );
}
