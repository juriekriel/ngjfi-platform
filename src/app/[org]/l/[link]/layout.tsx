import { surveyMetadata } from "@/lib/surveyMetadata";

/** Makes a room link installable as its organisation's survey (the page itself is a client component). */
export function generateMetadata({ params }: { params: { org: string } }) {
  return surveyMetadata(params.org);
}

export default function LinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
