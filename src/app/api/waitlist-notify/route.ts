// Destination in the repo: src/app/api/waitlist-notify/route.ts
//
// Best-effort waitlist notification: a confirmation email to the person who
// just joined, and an internal heads-up to the team. This never blocks or
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

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM = process.env.WAITLIST_FROM_EMAIL || "hello@jfindx.org";

type WaitlistNotifyPayload = {
  email?: string;
  orgName?: string;
  role?: string;
  referralCode?: string;
};

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

  const { email, orgName, role, referralCode } = payload;
  if (!email || !orgName) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  const confirmation = sendEmail(
    apiKey,
    email,
    "You're on the list — The Jesus Index",
    `<p>Thanks for joining the first round on behalf of <b>${escapeHtml(orgName)}</b>.</p>
     <p>We'll place you in a country cluster and let you know when your round opens.
     In the meantime you'll get <b>Field Notes</b> — a monthly note on how the Index
     is being built. Unsubscribe any time.</p>
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
