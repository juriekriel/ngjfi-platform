// Destination in the repo: src/app/api/waitlist-notify/route.ts
//
// Best-effort waitlist notification: a confirmation email to the person who
// just joined, and an internal heads-up to the team.
//
// It sends ONLY for a real, fresh sign-up (migration 0062): the database is
// asked first — waitlist_claim_notification() — and answers with the row it
// holds, once. The email is written from that row, never from the request
// body, so this route can't be used to email arbitrary addresses or to put
// arbitrary text in front of anyone. This never blocks or
// fails the signup itself — waitlist_join()/waitlist_qualify() already
// committed the row in Supabase before this route is ever called from the
// client. Missing config (no RESEND_API_KEY yet) or a provider error here
// degrades to "no email sent", never "signup failed".
//
// Env vars (Netlify site settings → Environment variables, NOT NEXT_PUBLIC_*
// so they stay server-side only):
//   RESEND_API_KEY       — from resend.com, after verifying jfindx.org
//   WAITLIST_NOTIFY_TO    — internal recipient, e.g. ulrich@nxtmove.global
//   WAITLIST_FROM_EMAIL   — defaults to hello@jfindx.org if unset

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = process.env.WAITLIST_FROM_EMAIL || "hello@jfindx.org";

/** Only `kind` and `email` are read from the request; everything else comes from the database. */
type WaitlistNotifyPayload = {
  /** "setup_call" = the person said yes / maybe to a 30-minute setup call: tell the team only. */
  kind?: "join" | "setup_call";
  email?: string;
};

/** What waitlist_claim_notification() hands back — the saved sign-up, once. */
type Claimed = {
  email: string;
  org_name: string;
  role: string | null;
  referral_code?: string | null;
  setup_call?: string | null;
  countries?: string | null;
  reach?: string | null;
};

/** Ask the database whether there is a fresh, unsent sign-up for this address (0062). */
async function claim(email: string, kind: "join" | "setup_call"): Promise<Claimed | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("waitlist_claim_notification", { p_email: email, p_kind: kind });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("waitlist-notify: claim", error.message);
    return null;
  }
  return (data as Claimed | null) ?? null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const notifyTo = process.env.WAITLIST_NOTIFY_TO;

  if (!apiKey) {
    // Not configured yet — succeed quietly. The signup itself already saved;
    // this route existing but unconfigured should never surface as an error
    // to the person who just joined.
    return NextResponse.json({ skipped: "RESEND_API_KEY not set" }, { status: 200 });
  }

  let payload: WaitlistNotifyPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const asked = (payload.email ?? "").trim();
  if (!asked) return NextResponse.json({ error: "missing required fields" }, { status: 400 });

  // A setup-call request goes to the team only — never to the address given,
  // so this branch can't be used to email anyone else. The answer itself is
  // already saved (waitlist_qualify) and listed in the admin console.
  if (payload.kind === "setup_call") {
    if (!notifyTo) return NextResponse.json({ skipped: "nothing to send" }, { status: 200 });
    const row = await claim(asked, "setup_call");
    if (!row) return NextResponse.json({ skipped: "nothing to send" }, { status: 200 });
    const call = row.setup_call === "maybe" ? "maybe" : "yes";
    try {
      await sendEmail(
        apiKey,
        notifyTo,
        `Setup call ${call === "yes" ? "requested" : "maybe"}: ${row.org_name}`,
        `<p><b>${escapeHtml(row.org_name)}</b> said <b>${call}</b> to a 30-minute setup call.</p>
         <ul>
           <li>Email: <a href="mailto:${escapeHtml(row.email)}?subject=${encodeURIComponent("Your Jesus Index setup call")}">${escapeHtml(row.email)}</a></li>
           <li>Role: ${escapeHtml(row.role || "—")}</li>
           <li>Countries: ${escapeHtml(row.countries || "—")}</li>
           <li>Young people reached: ${escapeHtml(row.reach || "—")}</li>
         </ul>
         <p>Reply to them to book a time, then tick it off in the console: jfindx.org/build → Applications → Setup calls.</p>`,
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("waitlist-notify: setup call", e);
      return NextResponse.json({ ok: false }, { status: 207 });
    }
  }

  // Only a sign-up the database saved in the last few minutes, and only once.
  const row = await claim(asked, "join");
  if (!row) return NextResponse.json({ skipped: "nothing to send" }, { status: 200 });
  const { email, org_name: orgName, role, referral_code: referralCode } = row;

  const confirmation = sendEmail(
    apiKey,
    email,
    "You're in — The Jesus Index",
    `<p>Welcome — <b>${escapeHtml(orgName)}</b> is in. The Index is free for ministries, and it stays free.</p>
     <p>What happens next:</p>
     <ol>
       <li><a href="https://jfindx.org/access">Sign in</a> with your ministry email to set up your page — your logo, colour and welcome.</li>
       <li>Try your survey with a test link. Answers on a test link are never kept.</li>
       <li>Read the <a href="https://jfindx.org/resources/consent">consent resource</a> and confirm consent — for your organisation, and for each survey you send.</li>
       <li>Share the <a href="https://jfindx.org/#pitch">pitch documents</a> with your team and leaders.</li>
     </ol>
     <p>Questions? Just reply to this email.</p>
     ${referralCode ? `<p>Your referral code: <code>${escapeHtml(referralCode)}</code></p>` : ""}
     <p>— The Jesus Index team</p>`,
  );

  const internal = notifyTo
    ? sendEmail(
        apiKey,
        notifyTo,
        `New waitlist signup: ${orgName}`,
        `<p><b>${escapeHtml(orgName)}</b> just joined the waitlist.</p>
         <ul>
           <li>Email: ${escapeHtml(email)}</li>
           <li>Role: ${escapeHtml(role || "—")}</li>
           <li>Referral code: ${escapeHtml(referralCode || "—")}</li>
         </ul>`,
      )
    : Promise.resolve();

  const results = await Promise.allSettled([confirmation, internal]);
  const failed = results.filter((r) => r.status === "rejected");

  if (failed.length) {
    // eslint-disable-next-line no-console
    console.error("waitlist-notify: partial failure", failed);
    return NextResponse.json({ ok: false, partial: true }, { status: 207 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
