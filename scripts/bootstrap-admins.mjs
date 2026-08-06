// Promotes the first administrators.
//
// set_user_role() deliberately refuses unless the caller is already an admin —
// which leaves a chicken-and-egg on a fresh database. This breaks it once, over
// the Management API, and is the only sanctioned way to do so. Anyone promoted
// after this goes through the admin worklist in the app.
//
//   node scripts/bootstrap-admins.mjs you@example.org someone@example.org
//
// An address that has never signed in has no auth.users row yet; the script says
// so rather than failing silently, because "I set it and nothing happened" is the
// worst possible outcome for an access change.
import { readFileSync } from "node:fs";

const REF = "whtbfhbhkhwfmeekvmxq";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const line = raw.split("\n").find((l) => l.trim().startsWith("SUPABASE_ACCESS_TOKEN"));
if (!line) throw new Error("SUPABASE_ACCESS_TOKEN is not set in .env.local");
const token = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

const emails = process.argv.slice(2);
if (!emails.length) {
  console.error("usage: node scripts/bootstrap-admins.mjs email [email…]");
  process.exit(1);
}

async function runSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const list = emails.map((e) => `'${e.toLowerCase().replace(/'/g, "''")}'`).join(",");

// Ensure an app_users row exists even if the trigger predates the account.
await runSql(`
  insert into public.app_users (id)
  select u.id from auth.users u
   where lower(u.email) in (${list})
     and not exists (select 1 from public.app_users a where a.id = u.id);
  update public.app_users a set role = 'admin'
    from auth.users u
   where u.id = a.id and lower(u.email) in (${list});
`);

const rows = await runSql(`
  select u.email, coalesce(a.role, '—') as role
    from auth.users u
    left join public.app_users a on a.id = u.id
   where lower(u.email) in (${list})
   order by u.email;
`);

console.log("\nadministrators:");
for (const e of emails) {
  const found = rows.find((r) => r.email?.toLowerCase() === e.toLowerCase());
  console.log(
    found
      ? `  ✓ ${found.email} → ${found.role}`
      : `  ✗ ${e} — no account yet. They must sign in once at jfindx.org/access, then re-run this.`,
  );
}
