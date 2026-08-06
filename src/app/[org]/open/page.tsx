import Survey from "@/components/survey/Survey";

/**
 * jfindx.org/<short_name>/open — the PUBLIC link.
 *
 * `org_links()` has handed this URL out since migration 0011 and the console
 * now shows it with a Copy button next to it — but the route did not exist, so
 * every public link 404'd. Same component, same instrument, different campaign.
 */
export default function OpenSurveyPage({ params }: { params: { org: string } }) {
  return <Survey slug={params.org} audience="public" />;
}
