import { Footer, Masthead } from "@/components/site/Chrome";
import DemoExperience from "./DemoExperience";

export const metadata = {
  title: "See a Demo — The Jesus Index",
  description:
    "See the Jesus Index for a ministry, an organisation or a church: their branded survey, what their young people see, their live dashboard, what they change — and the global view. Every demo figure is invented.",
};

export default function SeeADemoPage() {
  return (
    <>
      <Masthead edition="See a Demo · fictional ministries, invented figures" />
      <main className="mx-auto max-w-5xl px-5">
        <DemoExperience />
      </main>
      <Footer />
    </>
  );
}
