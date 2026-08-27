---
name: ngjfi-platform
description: Develop the Jesus Index platform (jfindx.org / ngjfi-platform) — write code, add features, fix bugs, change the design system, edit the instrument, or write database migrations on github.com/juriekriel/ngjfi-platform. Use for any request to build, change, debug, review or ship anything in that repo: "add a feature to the Index", "fix the survey page", "change the platform colours", "add a migration", "update the instrument", "why is the dashboard broken", "open a PR on ngjfi-platform", "work on jfindx". Starts by proving the session can actually push before any code is written, then carries the project's guardrails — never push to main, migrations only, colour is semantic, respondents stay anonymous. Not for the NXT Move website (use nxtmove-website) or the leadership pitch HTML.
---

# The Jesus Index platform — how to build here

`github.com/juriekriel/ngjfi-platform` · live at `jfindx.org` · Next.js (App Router) +
TypeScript + Tailwind · Supabase (Postgres + RLS + Auth) · Netlify with PR deploy previews.

Two people build here — Jurie Kriel and Ulrich Lombard — plus agents working for each of
them. Everything below exists so parallel work doesn't collide and so nothing ships that
quietly breaks the model.

---

## Step 0 — prove this session can push. Before anything else.

**Do this first, every time, before writing a single line of code.** It takes thirty
seconds and it is the single most important step in this document.

```bash
git checkout main && git pull
BRANCH="chore/push-check-$(date +%s)"
git checkout -b "$BRANCH"
git push -u origin "$BRANCH"     # an empty branch — nothing in it
```

**If that succeeded**, clean up and carry on:

```bash
git push origin --delete "$BRANCH"
git checkout main
git branch -D "$BRANCH"
```

(Keep `$BRANCH` in the same shell session, or substitute the name by hand — running
`git branch -D` against whatever is currently checked out is not what you want.)

**If it failed**, stop. Do not write code yet. Go to `references/setup.md` and fix the
session first, then repeat this step until it passes.

### Why this is non-negotiable

Cloning a *public* repo needs no credential. So a session that cannot push still looks
completely healthy — it clones, reads, edits, commits and runs tests without a single
warning. The failure only surfaces at `git push`, by which point the work exists and is
trapped inside a container that gets reclaimed.

This has already cost this project three weeks of Ulrich's work once. The empty push turns
a silent, late, expensive failure into a loud, early, free one.

**The error to recognise:**

```
fatal: could not read Username for 'https://github.com': No such device or address
```

That is git trying to prompt for a username with no keyboard attached. It is **not** a
permissions problem — both collaborators have write access. It means this session has no
credential. `references/setup.md` fixes it.

---

## Step 1 — orient before changing anything

Read, in this order:

1. **`CLAUDE.md`** in the repo root — the standing brief. Non-negotiables, the 3×4 model,
   the design system, the definition of done. Everything here defers to it.
2. **`docs/BUILD_BRIEF.md`** — the requirements source of truth.
3. The file you're about to change, plus whatever it imports.

If a request conflicts with `CLAUDE.md`, say so and ask. Do not quietly pick one.

`references/architecture.md` maps the codebase — where things live and which files are
load-bearing.

---

## Step 2 — the working loop

```bash
git checkout main && git pull
git checkout -b feat/short-description      # feat/ fix/ chore/ db/
```

Work in small commits with real messages. Then, **before pushing**:

```bash
npm run typecheck
npm test
npm run build
```

All three must pass — CI runs exactly these and the merge button stays disabled until they
are green. Then:

```bash
git push -u origin HEAD
```

Open the PR from the link git prints. **Netlify posts a Deploy Preview URL as a comment
within about a minute — that preview is how the change gets judged, not a screenshot and
not a description.** Report the PR link and the preview URL.

`main` is protected: PR required, CI must pass, branch must be up to date, squash-merge
only, no force pushes, no bypassing. If the PR says "out of date", click **Update branch**
and wait for CI again. Never tick *Merge without waiting for requirements*.

**Only Jurie merges.** Open the PR and hand over the links.

---

## Guardrails

These are the ones most likely to be broken by someone moving fast. The full set is in
`CLAUDE.md` §3 and §7; the reasoning behind each is in `references/guardrails.md`.

**Never push to `main`.** Branch and PR, always. This includes "tiny" fixes.

**Colour carries meaning — it is not decoration.** Emerald `#0B8A60` is the working colour
*and* means "up". Navy `#35639C` means levels. Vermillion `#B5451B` means **"down" and only
ever "down"**. The tier ramp holds hue constant and varies lightness alone, which is what
makes the heat grid read as a progression. Changing the brand to a warm colour collides with
vermillion at hue ~19°, so a rising figure and a falling one stop being distinguishable.
Read `docs/PALETTE.md` before touching any colour.

**All colour lives in the `:root` block of `src/app/globals.css`.** Nothing else. If you
find yourself writing a hex in a component, the system is being broken — put it in `:root`
and reference the token. The one deliberate exception is `SAMPLE_ORG.brand` in
`src/lib/sample.ts`, which is a white-label ministry's own colour, not a platform token.

**Database changes are migrations, never dashboard edits.** A new numbered file in
`supabase/migrations/`. **Claim the number in chat before you start** — Jurie and Ulrich
working in parallel will otherwise both create the same one and the second to merge breaks.
Highest at the time of writing is `0014`; check `ls supabase/migrations/` for the real
current number. Never edit a migration already merged to `main` — write a new one that
corrects it.

**Ask before** changing instrument wording or scoring (researcher-owned), spending money,
deleting data, or anything that would centralise identifiable data.

**Respondents are anonymous.** No names, emails, precise location or IP. Age is a band,
never a birthdate. Never design anything that centrally holds identifiable data about
under-18s. Orgs see aggregates only — no individual response is ever exposed to an org.

**Never overclaim.** Every figure is scoped to *"those who have completed the Index"*, and
sample size appears wherever a score does.

**Secrets.** The repo is **public**. Only `NEXT_PUBLIC_*` values may reach the browser. Never
commit `.env.local`, the service-role key or the database password, and never paste them
into chat. The app runs on the anon key plus RLS alone. If you find a secret in the repo,
stop and say so — it needs rotating.

**The demo must never diverge from the product.** The landing page, `/tour` and the live
product render the *same* components. Never write a fixture, never fork a component "just
for the demo" — `tests/sample.test.ts` fails the build if you do.

---

## Definition of done

A change is done when it passes typecheck, tests and build · has been looked at on the
Deploy Preview · keeps respondents anonymous · exposes no individual response to an org ·
shows sample size alongside any score · scopes claims to *"of those who have completed the
Index"* · works on a low-end phone on a bad connection · and would still work if a new age
cohort were added tomorrow.

If you cannot verify one of these, say which and why. Do not report it as done.

---

## When something goes wrong

| What you see | What it means |
|---|---|
| `could not read Username for 'https://github.com'` | Session has no push credential — `references/setup.md`. Not a permissions problem. |
| `403` / "not in this session's authorized repository set" | Repo isn't attached to the session as a source — `references/setup.md`. |
| Push rejected, "protected branch" | Something tried to push to `main`. Branch instead. |
| CI red on the PR | Read the failing job's log and fix it. Don't merge around it. |
| "This branch is out-of-date" | Click **Update branch**, wait for CI. Never tick the bypass box. |
| Claude can't find repo files | Folder isn't connected, or the clone is somewhere else. |
| Merge conflict | Stop and ask Jurie. Don't resolve it unilaterally. |
| Supabase project paused | The weekly keepalive Action should prevent this; run it manually from the Actions tab and tell Jurie. |
