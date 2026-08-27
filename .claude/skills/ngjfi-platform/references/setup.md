# Setting up a session that can actually push

Read this when the empty-push check in Step 0 fails, or when starting on a new machine.

The whole point: **get to a state where `git push` works, and prove it, before writing
code.** Everything below is in service of that.

---

## First, know what you're looking at

Both collaborators already have write access to `juriekriel/ngjfi-platform`:

- **Jurie Kriel** — owner
- **Ulrich Lombard** (`ulrich-nxtmove`) — Collaborator with write, since 6 August 2026

So a push failure is **never** an access problem. It is always one of two things:

| Error | Meaning |
|---|---|
| `could not read Username for 'https://github.com'` | No credential exists in this session at all. Git is trying to prompt a human that isn't there. |
| `403` · "not in this session's authorized repository set" | A credential mechanism exists, but this repo isn't attached to the session. |

---

## Path A — Cowork session (cloud)

This is how the platform has actually been built, and it works — provided the repo is
attached **as a source**, not cloned by hand.

1. **Attach the repository to the session before any git work.** In the Cowork session, add
   `juriekriel/ngjfi-platform` as a source, **with push (write) access** — read-only is the
   default in some flows and it will pass every check until the moment you push.
2. **Let the clone come from that attachment.** If a session clones the repo by hand with
   `git clone https://github.com/...`, it gets a working read-only copy with no credential
   attached — the exact trap described in SKILL.md Step 0.
3. Run the Step 0 empty push. It must succeed before you continue.

If the repo cannot be attached with push access in this session, do not push on with a
hand clone. Either fix the attachment or switch to Path B.

## Path B — on your own computer

Use this when you want a real local dev loop, or when Path A isn't available.

**Prerequisites — check before assuming they're there.** A Mac with none of these installed
is common and is not a sign anything is broken:

```bash
node -v      # need v22.6 or newer (npm test uses --experimental-strip-types)
npm -v
git --version
gh --version
```

Install what's missing:

- **Node** — the LTS build from https://nodejs.org, or `brew install node`
- **GitHub CLI** — `brew install gh`

**Then authenticate once, and it stays authenticated:**

```bash
gh auth login
```

Choose GitHub.com → HTTPS → authenticate in browser → **yes** when it offers to configure
git with your GitHub credentials. That last part is the bit that matters: it writes a
credential helper entry the OS keeps, so every terminal and every future session on that
machine can push without doing this again.

Verify:

```bash
gh auth status
```

> A Mac can have `credential.helper=osxkeychain` configured and still have **no stored
> credential** — that combination fails with `could not read Username`, which looks
> alarming and is fixed entirely by `gh auth login`.

**Then clone and install:**

```bash
git clone https://github.com/juriekriel/ngjfi-platform.git
cd ngjfi-platform
npm install
```

Keep the clone somewhere plain — `~/Documents/GitHub/` is fine. **Not** inside iCloud
Drive, Dropbox or Google Drive; sync software fights with `node_modules` and produces
errors that look like bugs and aren't.

If you're driving this through Cowork's "On your computer" mode, connect that folder to the
session with **Add folder** so the session can see the real source instead of guessing from
the deployed page.

Finally, run the Step 0 empty push. Do not skip it just because `gh auth status` looked
fine.

---

## Environment variables

The app needs a `.env.local` in the repo root to talk to Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://whtbfhbhkhwfmeekvmxq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ask Jurie>
```

**Ask Jurie for the anon key and expect it via a shared password-manager item — not chat,
not email.** Do not guess it, do not leave a placeholder, and do not proceed without it:
the UI will render a setup notice instead of crashing, which is easy to mistake for a bug.

`.env.local` is gitignored. Keep it that way — **this repo is public**.

You will never need the **service-role key** or the **database password** for development.
If you ever end up holding one, tell Jurie: it needs rotating.

Then:

```bash
npm run dev
```

and open the URL it prints.

---

## Supabase access

Both collaborators are members of the **NextGen Global Collab** organisation on Supabase
(project `ngjfi-platform`, ref `whtbfhbhkhwfmeekvmxq`):

- Jurie — Owner
- Ulrich — **Developer**: browse and edit tables, run SQL, manage Edge Functions, inspect
  auth users, read logs. Cannot change org settings, billing, or delete the project.

MFA is currently disabled on both accounts and the team page flags it. Worth enabling.

**Developer access is not permission to hand-edit the schema.** Schema changes are
migrations, always — see the migration protocol in SKILL.md and `CONTRIBUTING.md`.

---

## Netlify

Neither previews nor CI need a Netlify seat. Netlify comments a Deploy Preview URL on every
PR automatically, and that is the whole review loop.

A seat is only needed to edit environment variables, change build settings, or trigger
manual deploys. If that comes up, ask Jurie rather than working around it.

---

## Rescuing work from a session that cannot push

If code already exists in a session that fails Step 0, get it out **before** trying to fix
anything else. Sandbox containers are reclaimed and the work goes with them.

```bash
git log --oneline main..HEAD          # confirm what's there
git diff main...HEAD > rescue.patch   # everything, as one file
```

Then send `rescue.patch` into the conversation and download it. Once it is on a real
machine the work is safe.

To land it from a session that *does* pass Step 0:

```bash
git checkout main && git pull
git checkout -b feat/short-description
git apply rescue.patch
git add -A && git commit -m "…"
npm run typecheck && npm test && npm run build
git push -u origin HEAD
```

---

## The habit that makes all of this unnecessary

Push the branch **empty**, before writing any code. Thirty seconds, every time. It converts
the one failure mode that has actually hurt this project into something you find out about
immediately and for free.
