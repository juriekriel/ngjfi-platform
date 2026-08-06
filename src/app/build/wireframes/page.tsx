import Wireframes from "./Wireframes";

export const metadata = {
  title: "The Index — console wireframes",
  robots: { index: false, follow: false },
};

/**
 * The console specification, drawn in the live design system.
 *
 * Not a live surface and not behind auth: it shows no data, only shape. It sits
 * inside the app rather than in a drawing tool for the same reason /tour does —
 * a specification that renders from the same tokens as the product cannot
 * promise a look the product will not ship.
 */
export default function WireframesPage() {
  return <Wireframes />;
}
