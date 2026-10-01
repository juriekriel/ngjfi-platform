import { surveyMetadata } from "@/lib/surveyMetadata";
import Survey from "@/components/survey/Survey";

/**
 * jfindx.org/<short_name> — the organisation's survey link.
 *
 * One link per organisation (migration 0044). Distribution links
 * (/<short_name>/l/<link>) are the same survey, tagged by room.
 */
export function generateMetadata({ params }: { params: { org: string } }) {
  return surveyMetadata(params.org);
}

export default function SurveyPage({ params }: { params: { org: string } }) {
  return <Survey slug={params.org} />;
}
