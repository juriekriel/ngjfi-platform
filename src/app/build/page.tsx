import Console from "./Console";

export const metadata = {
  title: "The Index — Console",
  robots: { index: false, follow: false },
};

/**
 * The Index — the authenticated engine.
 *
 * This is where a magic link lands. It is deliberately a WORKLIST rather than a
 * dashboard: the road to 2027 is a chain of handovers that each need a person to
 * notice them, so the job of this screen is to show what is waiting on a human.
 *
 * Every tier check happens in the database (`my_role()`, `admin_worklist()`),
 * never here — this component renders whatever it is allowed to fetch, and is
 * told nothing it should not see.
 */
export default function BuildPage() {
  return <Console />;
}
