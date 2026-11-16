import { Footer, Masthead } from "@/components/site/Chrome";
import OrganisationView from "@/components/site/OrganisationView";

export const metadata = {
  title: "Your Organisation — The Jesus Following Index",
  description:
    "What your organisation gets out of running the Jesus Following Index — and, once you're signed in, a straight line to your own dashboard.",
};

export default function OrganisationPage() {
  return (
    <>
      <Masthead />
      <main className="mx-auto max-w-5xl px-5">
        <OrganisationView />
      </main>
      <Footer />
    </>
  );
}
