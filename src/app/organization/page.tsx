import { Masthead } from "@/components/site/Chrome";
import OrganizationView from "@/components/site/OrganizationView";

export const metadata = {
  title: "Your Organization — The Jesus Index",
  description:
    "What your organisation gets out of running the Index — and, once you're signed in, a straight line to your own dashboard.",
};

export default function OrganizationPage() {
  return (
    <>
      <Masthead />
      <main className="mx-auto max-w-5xl px-5">
        <OrganizationView />
      </main>
    </>
  );
}
