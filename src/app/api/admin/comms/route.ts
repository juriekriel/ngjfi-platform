// Collab → Org Administrator email (migration 0056).
//
// Called from the admin console's Comms band with the administrator's own
// Supabase access token. This route never decides who is an administrator or
// who is in the audience — the database does: admin_comms_recipients() raises
// for anyone but an administrator and returns only real Org Administrators,
// so this route cannot be used to email an arbitrary address. It then renders
// each email with the same functions as the console's preview (src/lib/comms),
// sends through Resend, and records every send with admin_comms_log().
//
// No service-role key is involved: the Supabase client below runs as the
// signed-in administrator, on the anon key + RLS.
//
// Env vars (Netlify → Environment variables; NOT NEXT_PUBLIC_*):
//   RESEND_API_KEY     — already used by /api/waitlist-notify
//   COMMS_FROM_EMAIL   — e.g. "The Jesus Index <team@jfindx.org>"; falls back
//                        to WAITLIST_FROM_EMAIL, then hello@jfindx.org
//   COMMS_REPLY_TO     — optional; where replies go (e.g. ulrich@nxtmove.global)

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recipientKey, renderEmail, type CommsRecipient } from "@/lib/comms";

export const dynamic = "force-dynamic";

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const MAX_RECIPIENTS = 500;

type SendBody = {
  mode: "single" | "broadcast";
  /** The sequence/update template this came from, for the board. Null for a one-off. */
  template_key?: string | null;
  subject: string;
  body: string;
  /** single: the people picked, with an optional name typed in the composer. */
  recipients?: { email: string; org_id: string; name?: string | null }[];
  include_sandbox?: boolean;
  include_invited?: boolean;
  /** broadcast: only people who have not yet been sent this template. */
  only_missing?: boolean;
  /** Render and count, send nothing. */
  dry_run?: boolean;
};

function siteUrl(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env && !/localhost/.test(env)) return env;
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Supabase isn't configured for this deployment." }, { status: 500 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let p: SendBody;
  try {
    p = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (p.mode !== "single" && p.mode !== "broadcast") return NextResponse.json({ error: "mode must be single or broadcast" }, { status: 400 });
  if (!p.subject?.trim() || !p.body?.trim()) return NextResponse.json({ error: "A subject and a message are both needed." }, { status: 400 });

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Who is sending — for {{sender_name}}. Also proves the token is live.
  const { data: who, error: whoErr } = await sb.auth.getUser(token);
  if (whoErr || !who.user) return NextResponse.json({ error: "Your sign-in has expired. Reload and sign in again." }, { status: 401 });
  const { data: me } = await sb.from("app_users").select("full_name,email").eq("id", who.user.id).maybeSingle();
  const senderName = (me?.full_name as string | null)?.trim() || "The Jesus Index team";

  // The audience, as the database sees it right now. Raises for non-admins.
  const { data: all, error: recErr } = await sb.rpc("admin_comms_recipients", {
    p_include_sandbox: Boolean(p.include_sandbox),
    p_include_invited: p.include_invited !== false,
    p_email: null,
  });
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 403 });
  const known = (all as CommsRecipient[]) ?? [];

  let audience: CommsRecipient[];
  if (p.mode === "single") {
    const byKey = new Map(known.map((r) => [recipientKey(r), r]));
    const asked = p.recipients ?? [];
    if (!asked.length) return NextResponse.json({ error: "Pick who to send it to." }, { status: 400 });
    audience = [];
    for (const a of asked) {
      const hit = byKey.get(recipientKey({ email: a.email, org_id: a.org_id }));
      if (!hit)
        return NextResponse.json(
          { error: `${a.email} isn't an Org Administrator of that organisation. Add them from Applications → the organisation first.` },
          { status: 400 },
        );
      audience.push(a.name?.trim() ? { ...hit, name: a.name.trim() } : hit);
    }
  } else {
    audience = p.only_missing && p.template_key ? known.filter((r) => !r.sent?.[p.template_key as string]) : known;
  }

  if (!audience.length) return NextResponse.json({ sent: 0, failed: 0, count: 0, note: "Nobody to send to." });
  if (audience.length > MAX_RECIPIENTS)
    return NextResponse.json({ error: `That's ${audience.length} people — more than ${MAX_RECIPIENTS} at once. Narrow it first.` }, { status: 400 });

  const site = siteUrl(req);
  const rendered = audience.map((r) => ({ r, e: renderEmail({ subject: p.subject, body: p.body }, r, site, senderName) }));
  const missing = [...new Set(rendered.flatMap((x) => x.e.missing))];
  if (missing.length)
    return NextResponse.json({ error: `Unknown placeholder${missing.length > 1 ? "s" : ""}: ${missing.map((m) => `{{${m}}}`).join(", ")}` }, { status: 400 });

  if (p.dry_run) return NextResponse.json({ count: audience.length, preview: rendered[0].e });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "Email isn't set up on this deployment yet (RESEND_API_KEY is missing). Nothing was sent." }, { status: 503 });

  const from = process.env.COMMS_FROM_EMAIL || process.env.WAITLIST_FROM_EMAIL || "hello@jfindx.org";
  const replyTo = process.env.COMMS_REPLY_TO || undefined;

  // Resend's batch endpoint takes up to 100 emails per call. Each person gets
  // their OWN email — never a shared To: line that would show one ministry's
  // administrator to another.
  const log: Record<string, unknown>[] = [];
  for (let i = 0; i < rendered.length; i += 100) {
    const chunk = rendered.slice(i, i + 100);
    let ids: (string | undefined)[] = [];
    let error: string | null = null;
    try {
      const res = await fetch(RESEND_BATCH_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          chunk.map(({ r, e }) => ({
            from,
            to: [r.email],
            subject: e.subject,
            html: e.html,
            text: e.text,
            ...(replyTo ? { reply_to: replyTo } : {}),
          })),
        ),
      });
      if (!res.ok) error = `Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
      else {
        const j = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
        ids = j?.data?.map((d) => d.id) ?? [];
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    chunk.forEach(({ r, e }, k) =>
      log.push({
        email: r.email,
        org_id: r.org_id,
        template_key: p.template_key ?? null,
        subject: e.subject,
        mode: p.mode,
        status: error ? "failed" : "sent",
        provider_id: ids[k] ?? null,
        error,
      }),
    );
  }

  const { error: logErr } = await sb.rpc("admin_comms_log", { p_rows: log });
  const sent = log.filter((l) => l.status === "sent").length;
  const failed = log.length - sent;
  return NextResponse.json(
    {
      count: log.length,
      sent,
      failed,
      error: failed ? (log.find((l) => l.error)?.error as string) : undefined,
      log_error: logErr?.message,
    },
    { status: failed && !sent ? 502 : 200 },
  );
}
