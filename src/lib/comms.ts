/**
 * Collab → Org Administrator comms (migration 0056).
 *
 * Pure functions only — no network, no Supabase — so the admin console's live
 * preview and the server route that actually sends render the SAME text, and
 * so the rendering is tested (tests/comms.test.ts).
 *
 * A template is plain text with a tiny, forgiving markup:
 *   - a blank line starts a new paragraph
 *   - lines starting "- " are bullets, "1. " numbered
 *   - **bold**
 *   - bare https:// links become links
 *   - {{placeholders}} are filled per recipient
 *
 * Everything here is about ADULT STAFF of organisations (a work email, a name,
 * the organisation they run). Nothing touches respondents or their answers.
 */

export type CommsTemplate = {
  key: string;
  title: string;
  subject: string;
  body: string;
  /** 'sequence' templates are the onboarding steps, in `position` order. 'update' is a one-off announcement. */
  kind: "sequence" | "update";
  position: number | null;
  updated_at?: string | null;
};

export type CommsRecipient = {
  email: string;
  name: string | null;
  org_id: string;
  org_name: string;
  org_slug: string;
  org_status: string;
  is_demo: boolean;
  /** 'member' = signed in and attached; 'invite' = invited, not signed in yet. */
  source: "member" | "invite";
  /** template key → ISO time it was last sent to this person for this organisation. */
  sent: Record<string, string>;
};

/** Every placeholder a template may use, and what fills it. Shown as chips in the composer. */
export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "first_name", label: "Their first name (or “there”)" },
  { key: "org_name", label: "Their organisation" },
  { key: "dashboard_url", label: "Their dashboard" },
  { key: "tour_url", label: "Dashboard walkthrough" },
  { key: "survey_url", label: "Their survey link" },
  { key: "settings_url", label: "Edit your dashboard (consent)" },
  { key: "team_url", label: "Team & access" },
  { key: "consult_url", label: "“What does this mean?”" },
  { key: "consent_url", label: "Consent resource" },
  { key: "site_url", label: "jfindx.org" },
  { key: "sender_name", label: "Your name" },
];

/** Mailbox names that are not a person — never greet "Hi Admin". */
const ROLE_WORDS = new Set([
  "admin", "administrator", "info", "hello", "hi", "office", "team", "contact", "youth",
  "church", "ministry", "ministries", "mail", "support", "noreply", "no-reply", "enquiries",
  "inquiries", "general", "pastor", "pastors", "staff", "leaders", "leadership", "director",
  "media", "comms", "communications", "events", "accounts", "finance", "test",
]);

function capitalise(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1).toLocaleLowerCase() : s;
}

/**
 * A first name to greet someone by: the saved name if there is one, otherwise a
 * careful guess from the email ("jurie.kriel@…" → "Jurie"), otherwise null.
 * Role mailboxes ("admin@", "youth@") and anything with digits are never guessed.
 */
export function firstNameFrom(name: string | null | undefined, email: string | null | undefined): string | null {
  const saved = (name ?? "").trim();
  if (saved && !saved.includes("@")) return capitalise(saved.split(/\s+/)[0]);
  const local = (email ?? "").split("@")[0]?.toLowerCase() ?? "";
  const first = local.split(/[._+-]/)[0] ?? "";
  if (!/^[a-z]{2,20}$/.test(first) || ROLE_WORDS.has(first) || ROLE_WORDS.has(local)) return null;
  return capitalise(first);
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** The values for one recipient. `name` overrides the saved/guessed first name when given. */
export function varsFor(
  r: Pick<CommsRecipient, "email" | "name" | "org_name" | "org_slug">,
  siteUrl: string,
  senderName: string,
): Record<string, string> {
  const site = trimSlash(siteUrl);
  const dash = `${site}/${r.org_slug}/dashboard`;
  return {
    first_name: firstNameFrom(r.name, r.email) ?? "there",
    org_name: r.org_name,
    dashboard_url: dash,
    tour_url: `${dash}?tour=1`,
    survey_url: `${site}/${r.org_slug}`,
    settings_url: `${dash}?view=settings`,
    team_url: `${dash}?view=team`,
    consult_url: `${dash}?consult=1`,
    consent_url: `${site}/resources/consent`,
    site_url: site,
    sender_name: senderName || "The Jesus Index team",
  };
}

/** Fill {{placeholders}}. Unknown ones are left visible and reported, never silently blanked. */
export function fill(text: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, k: string) => {
    if (k in vars) return vars[k];
    missing.add(k);
    return whole;
  });
  return { text: out, missing: [...missing] };
}

/** Names of the placeholders a text uses that we don't know how to fill. */
export function unknownPlaceholders(text: string): string[] {
  const known = new Set(PLACEHOLDERS.map((p) => p.key));
  const found = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) if (!known.has(m[1])) found.add(m[1]);
  return [...found];
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// Email clients can't read CSS variables, so the email carries its own copies
// of the platform tokens (ink #22252B, coral #FF7A47 / deep #E8551F, rules
// #E2E5EA, paper-deep #F5F6F8, ink-2 #5B6270). Keep them in step with globals.css.
const LINK = "color:#e8551f;text-decoration:underline;";

/** Inline markup on already-escaped text: **bold** and bare links. */
function inline(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (u) => `<a href="${u}" style="${LINK}">${u.replace(/^https?:\/\//, "")}</a>`);
}

/** The body markup → HTML fragments (escaped first, so a template can never inject markup). */
export function bodyToHtml(body: string): string {
  const blocks = body.replace(/\r\n/g, "\n").trim().split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trimEnd());
      if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
        const items = lines.map((l) => `<li style="margin:0 0 6px;">${inline(escapeHtml(l.replace(/^\s*[-•]\s+/, "")))}</li>`).join("");
        return `<ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>`;
      }
      if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
        const items = lines.map((l) => `<li style="margin:0 0 6px;">${inline(escapeHtml(l.replace(/^\s*\d+[.)]\s+/, "")))}</li>`).join("");
        return `<ol style="margin:0 0 16px;padding-left:20px;">${items}</ol>`;
      }
      return `<p style="margin:0 0 16px;">${lines.map((l) => inline(escapeHtml(l))).join("<br>")}</p>`;
    })
    .join("\n");
}

/** The plain-text part of the email: the body without the bold markers. */
export function bodyToText(body: string): string {
  return body.replace(/\*\*(.+?)\*\*/g, "$1").trim();
}

/**
 * The whole email, in a layout every mail client renders: one table, inline
 * styles, white ground, one coral rule. The Index sits in the footer, with
 * why this person is getting it.
 */
export function emailHtml(bodyHtml: string, orgName: string, siteUrl: string): string {
  const site = trimSlash(siteUrl);
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e5ea;border-radius:12px;">
<tr><td style="padding:22px 28px 0;font-family:Arial,Helvetica,sans-serif;">
<span style="display:inline-block;width:18px;height:18px;border-radius:5px;background:#ff7a47;vertical-align:middle;"></span>
<span style="font-weight:700;font-size:15px;color:#22252b;vertical-align:middle;margin-left:6px;">JFINDX</span>
</td></tr>
<tr><td style="padding:18px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#22252b;">
${bodyHtml}
</td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid #e2e5ea;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#5b6270;">
You're receiving this because you're the Org Administrator for ${escapeHtml(orgName)} on <a href="${site}" style="color:#5b6270;">${escapeHtml(site.replace(/^https?:\/\//, ""))}</a>. Just reply if you'd rather not get these.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export type RenderedEmail = { subject: string; html: string; text: string; missing: string[] };

/** One recipient's finished email. */
export function renderEmail(
  t: Pick<CommsTemplate, "subject" | "body">,
  r: Pick<CommsRecipient, "email" | "name" | "org_name" | "org_slug">,
  siteUrl: string,
  senderName: string,
): RenderedEmail {
  const vars = varsFor(r, siteUrl, senderName);
  const s = fill(t.subject, vars);
  const b = fill(t.body, vars);
  return {
    subject: s.text.replace(/\s+/g, " ").trim(),
    html: emailHtml(bodyToHtml(b.text), r.org_name, siteUrl),
    text: `${bodyToText(b.text)}\n\n—\nYou're receiving this because you're the Org Administrator for ${r.org_name} on ${trimSlash(siteUrl).replace(/^https?:\/\//, "")}.`,
    missing: [...new Set([...s.missing, ...b.missing])],
  };
}

/** The sequence templates, in order. */
export function sequenceOf(templates: CommsTemplate[]): CommsTemplate[] {
  return templates
    .filter((t) => t.kind === "sequence")
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.key.localeCompare(b.key));
}

/** The first sequence step this person hasn't been sent for this organisation, or null when they've had them all. */
export function nextStep(templates: CommsTemplate[], r: Pick<CommsRecipient, "sent">): CommsTemplate | null {
  return sequenceOf(templates).find((t) => !r.sent?.[t.key]) ?? null;
}

/** One row per person per organisation — the key the board and the send log agree on. */
export function recipientKey(r: Pick<CommsRecipient, "email" | "org_id">): string {
  return `${r.email.toLowerCase()}|${r.org_id}`;
}
