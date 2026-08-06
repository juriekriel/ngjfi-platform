import Survey from "@/components/survey/Survey";

/**
 * jfindx.org/<short_name> — the COMMUNITY link.
 *
 * For the young people a ministry already reaches: camps, services, groups.
 * Its sibling at /<short_name>/open fields the same instrument to everyone
 * else. The gap between the two is the most useful number the Index produces,
 * which is why they must never become two different surveys.
 */
export default function SurveyPage({ params }: { params: { org: string } }) {
  return <Survey slug={params.org} audience="community" />;
}
