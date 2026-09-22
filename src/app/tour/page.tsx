import { Masthead } from "@/components/site/Chrome";
import Walkthrough from "./Walkthrough";

export const metadata = {
  title: "How it will work — The Jesus Index",
  description:
    "A guided walk through the whole platform, one beat at a time: what a young person sees, what a ministry gets back, and what the Collab sees across every organisation.",
};

export default function TourPage() {
  return (
    <>
      <Masthead />
      <main className="mx-auto max-w-5xl px-5">
        <Walkthrough />
      </main>
    </>
  );
}
