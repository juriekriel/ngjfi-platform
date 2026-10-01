import { redirect } from "next/navigation";

/**
 * jfindx.org/<short_name>/open — retired (migration 0044).
 *
 * There used to be two links per organisation, "community" and "public".
 * The distinction didn't fit how the survey is built, so every organisation
 * now has one link. This address stays alive as a redirect because it has
 * been printed on QR codes and posters.
 */
export default function OpenSurveyPage({ params }: { params: { org: string } }) {
  redirect(`/${params.org}`);
}
